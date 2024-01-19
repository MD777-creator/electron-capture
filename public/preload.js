const Event = require('events')
const { contextBridge, ipcRenderer } = require('electron')

const CREATE_RECT = 1
const MOVING_RECT = 2
const RESIZE = 3

const ANCHORS = [
    { row: 'x', col: 'y', cursor: 'nwse-resize' },
    { row: '', col: 'y', cursor: 'ns-resize' },
    { row: 'r', col: 'y', cursor: 'nesw-resize' },

    { row: 'x', col: '', cursor: 'ew-resize' },
    { row: 'r', col: '', cursor: 'ew-resize' },

    { row: 'x', col: 'b', cursor: 'nesw-resize' },
    { row: '', col: 'b', cursor: 'ns-resize' },
    { row: 'r', col: 'b', cursor: 'nwse-resize' },
]

let currentScreen, imgSrc, toolbarDom, capture

const init = async (
    $canvas,
    $bg,
    $sizeInfo,
    $toolbar,
    $btnClose,
    $btnOk,
    $btnSave,
    $btnReset,
    $mask
) => {
    currentScreen = await getCurrentScreenInstance()
    capture = new CaptureEditor($canvas, $bg, imgSrc)
    ipcRenderer.on('capture-screen', (_, { type, screenId }) => {
        if (type === 'select' && (screenId && screenId !== currentScreen.id)) capture.disable()
    })
    $mask.classList.add("mask")
    toolbarDom = $toolbar

    const onDrag = (selectRect) => {
        $toolbar.style.display = 'none'
        $sizeInfo.style.display = 'block'
        $sizeInfo.innerText = `${selectRect.w} * ${selectRect.h}`
        $sizeInfo.style.top = selectRect.y > 35 ? `${selectRect.y - 30}px` : `${selectRect.y + 10}px`
        $sizeInfo.style.left = `${selectRect.x}px`
    }

    const onDragEnd = () => {
        if (capture.selectRect) {
            ipcRenderer.send('capture-screen', {
                type: 'select',
                screenId: currentScreen.id,
            })
            const { r, b } = capture.selectRect
            $toolbar.style.display = 'flex'
            $toolbar.style.top = `${b + 15}px`
            $toolbar.style.right = `${window.screen.width - r}px`
        }
    }

    const onReset = () => {
        $toolbar.style.display = 'none'
        $sizeInfo.style.display = 'none'
    }

    capture.on('start-dragging', onDrag)
    capture.on('dragging', onDrag)
    capture.on('end-dragging', onDragEnd)
    capture.on('reset', onReset)

    $btnClose.addEventListener('click', () => {
        captureScreenEvt({ type: 'close' })
        window.close()
    })

    $btnReset.addEventListener('click', capture.reset)

    $btnOk.addEventListener('click', selectCapture)

    $btnSave.addEventListener('click', () => ipcRenderer.invoke("savePicInfo", capture.getImageUrl()).then(window.close)
    )
}

const selectCapture = () => {
    if (!capture.selectRect || toolbarDom.style.display != "flex") return
    ipcRenderer.send("saveInfo", capture.getImageUrl())
    window.close()
}

const getStream = (sources, currentScreen) => {
    return new Promise(resolve => {
        document.body.style.opacity = '0'
        let oldCursor = document.body.style.cursor
        document.body.style.cursor = 'none'

        const handleStream = (stream) => {
            document.body.style.cursor = oldCursor
            document.body.style.opacity = '1'
            const video = document.createElement('video')
            video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;'
            let loaded = false
            video.onloadedmetadata = () => {
                if (loaded) return
                loaded = true
                video.style.height = video.videoHeight + 'px'
                video.style.width = video.videoWidth + 'px'
                let canvas = document.createElement('canvas')
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                let ctx = canvas.getContext('2d')
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                imgSrc = canvas.toDataURL('image/png')
                video.pause()
                video.remove()
                try {
                    stream.getTracks()[0].stop()
                } catch (e) { }
                resolve()
            }
            video.srcObject = stream
            document.body.appendChild(video)
            // 少了这步，会黑屏...
            video.play()
        }

        const handleError = (e) => {
            console.log(e)
        }
        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: `${sources.filter(source => source.display_id + '' === currentScreen.id + '')[0].id}`,
                    minWidth: 1280,
                    minHeight: 720,
                    maxWidth: 8000,
                    maxHeight: 8000,
                },
            },
        }).then(handleStream, handleError)
    })

}

class CaptureEditor extends Event {
    constructor($canvas, $bg, imageSrc) {
        super()
        this.$canvas = $canvas
        this.imageSrc = imageSrc
        this.disabled = false
        this.scaleFactor = currentScreen.scaleFactor
        this.screenWidth = currentScreen.bounds.width
        this.screenHeight = currentScreen.bounds.height
        this.$bg = $bg
        this.ctx = $canvas.getContext('2d')
        this.onMouseDown = this.onMouseDown.bind(this)
        this.onMouseMove = this.onMouseMove.bind(this)
        this.onMouseUp = this.onMouseUp.bind(this)

        this.init()
    }

    async init() {
        this.$bg.style.backgroundImage = `url(${this.imageSrc})`
        this.$bg.style.backgroundSize = `${this.screenWidth}px ${this.screenHeight}px`
        let canvas = document.createElement('canvas')
        let ctx = canvas.getContext('2d')
        let img = await new Promise((resolve) => {
            let img = new Image()
            img.src = this.imageSrc
            img.complete ? resolve(img) : img.onload = () => resolve(img)
        })
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        this.bgCtx = ctx

        document.addEventListener('mousedown', this.onMouseDown)
        document.addEventListener('mousemove', this.onMouseMove)
        document.addEventListener('mouseup', this.onMouseUp)
    }

    onMouseDown(e) {
        if (this.disabled) return
        this.mouseDown = true
        const { pageX, pageY } = e
        if (this.selectRect) {
            const { w, h, x, y, r, b } = this.selectRect
            if (this.selectAnchorIndex !== -1) {
                this.startPoint = {
                    x: pageX,
                    y: pageY,
                    moved: false,
                    selectRect: { w, h, x, y, r, b },
                    rawRect: { w, h, x, y, r, b }
                }
                this.action = RESIZE
                return
            }
            this.startPoint = {
                x: e.pageX,
                y: e.pageY,
                moved: false,
            }
            if (pageX > x && pageX < r && pageY > y && pageY < b) {
                this.action = MOVING_RECT
                this.startDragRect = {
                    x: pageX,
                    y: pageY,
                    selectRect: { x, y, w, h, r, b },
                }
            } else this.action = CREATE_RECT
        } else {
            this.action = CREATE_RECT
            this.startPoint = {
                x: e.pageX,
                y: e.pageY,
                moved: false,
            }
            e.stopPropagation()
            e.preventDefault()
        }
    }

    onMouseDrag(e) {
        if (this.disabled) return
        e.stopPropagation()
        e.preventDefault()
        const { pageX, pageY } = e
        let startDragging
        let selectRect = this.selectRect
        if (!this.startPoint.moved) {
            if (Math.abs(this.startPoint.x - pageX) > 10 || Math.abs(this.startPoint.y - pageY) > 10) this.startPoint.moved = startDragging = true
        }
        if (!this.startPoint.moved) return
        if (this.action === MOVING_RECT) {
            if (startDragging) this.emit('start-dragging', selectRect)
            this.emit('dragging', selectRect)
            const { w, h } = selectRect
            const { x: startX, y: startY } = this.startPoint
            let newX = this.startDragRect.selectRect.x + pageX - startX
            let newY = this.startDragRect.selectRect.y + pageY - startY
            let newR = newX + w
            let newB = newY + h
            if (newX < 0) {
                newX = 0
                newR = w
            } else if (newR > this.screenWidth) {
                newR = this.screenWidth
                newX = newR - w
            }
            if (newY < 0) {
                newY = 0
                newB = h
            } else if (newB > this.screenHeight) {
                newB = this.screenHeight
                newY = newB - h
            }
            this.selectRect = {
                w,
                h,
                x: newX,
                y: newY,
                r: newR,
                b: newB,
            }
            this.drawRect()
        } else if (this.action === RESIZE) {
            this.emit('dragging', selectRect)
            let { row, col } = ANCHORS[this.selectAnchorIndex]
            if (row) {
                this.startPoint.rawRect[row] = this.startPoint.selectRect[row] + pageX - this.startPoint.x
                selectRect.x = this.startPoint.rawRect.x
                selectRect.r = this.startPoint.rawRect.r
                if (selectRect.x > selectRect.r) {
                    let x = selectRect.r
                    selectRect.r = selectRect.x
                    selectRect.x = x
                }
                selectRect.w = selectRect.r - selectRect.x
                this.startPoint.rawRect.w = selectRect.w
            }
            if (col) {
                this.startPoint.rawRect[col] = this.startPoint.selectRect[col] + pageY - this.startPoint.y
                selectRect.y = this.startPoint.rawRect.y
                selectRect.b = this.startPoint.rawRect.b

                if (selectRect.y > selectRect.b) {
                    let y = selectRect.b
                    selectRect.b = selectRect.y
                    selectRect.y = y
                }
                selectRect.h = selectRect.b - selectRect.y
                this.startPoint.rawRect.h = selectRect.h
            }
            this.drawRect()
        } else {
            const { pageX, pageY } = e
            let x, y, w, h, r, b
            if (this.startPoint.x > pageX) {
                x = pageX
                r = this.startPoint.x
            } else {
                r = pageX
                x = this.startPoint.x
            }
            if (this.startPoint.y > pageY) {
                y = pageY
                b = this.startPoint.y
            } else {
                b = pageY
                y = this.startPoint.y
            }
            w = r - x
            h = b - y

            this.selectRect = { x, y, w, h, r, b }

            selectRect = this.selectRect
            if (startDragging) this.emit('start-dragging', selectRect)

            this.emit('dragging', selectRect)
            this.drawRect(x, y, w, h)
        }
    }

    drawRect() {
        if (this.disabled) return

        if (!this.selectRect) return this.$canvas.style.display = 'none'

        const {
            x, y, w, h,
        } = this.selectRect

        const scaleFactor = this.scaleFactor
        let margin = 7
        let radius = 5
        this.$canvas.style.left = `${x - margin}px`
        this.$canvas.style.top = `${y - margin}px`
        this.$canvas.style.width = `${w + margin * 2}px`
        this.$canvas.style.height = `${h + margin * 2}px`
        this.$canvas.style.display = 'block'
        this.$canvas.width = (w + margin * 2) * scaleFactor
        this.$canvas.height = (h + margin * 2) * scaleFactor

        if (w && h) {
            let imageData = this.bgCtx.getImageData(x * scaleFactor, y * scaleFactor, w * scaleFactor, h * scaleFactor)
            this.ctx.putImageData(imageData, margin * scaleFactor, margin * scaleFactor)
        }
        this.ctx.fillStyle = '#ffffff'
        this.ctx.strokeStyle = '#67bade'
        this.ctx.lineWidth = 2 * this.scaleFactor

        this.ctx.strokeRect(margin * scaleFactor, margin * scaleFactor, w * scaleFactor, h * scaleFactor)
        this.drawAnchors(w, h, margin, scaleFactor, radius)
    }

    drawAnchors(w, h, margin, scaleFactor, radius) {
        if (this.disabled) return
        if (this.mouseDown && this.action === CREATE_RECT) return this.anchors = null

        this.ctx.beginPath()
        let anchors = [
            [0, 0],
            [w * this.scaleFactor / 2, 0],
            [w * this.scaleFactor, 0],
            [0, h * this.scaleFactor / 2],
            [w * this.scaleFactor, h * this.scaleFactor / 2],
            [0, h * this.scaleFactor],
            [w * this.scaleFactor / 2, h * this.scaleFactor],
            [w * this.scaleFactor, h * this.scaleFactor],
        ]
        this.anchors = anchors.map(([x, y]) => [this.selectRect.x + x / scaleFactor, this.selectRect.y + y / scaleFactor])
        anchors.forEach(([x, y], i) => {
            this.ctx.arc(x + margin * scaleFactor, y + margin * scaleFactor, radius * scaleFactor, 0, 2 * Math.PI)
            let next = anchors[(i + 1) % anchors.length]
            this.ctx.moveTo(next[0] + margin * scaleFactor + radius * scaleFactor, next[1] + margin * scaleFactor)
        })
        this.ctx.closePath()
        this.ctx.fill()
        this.ctx.stroke()
    }

    onMouseMove(e) {
        if (this.disabled) return
        if (this.mouseDown) return this.onMouseDrag(e)
        this.selectAnchorIndex = -1
        if (this.selectRect) {
            const { pageX, pageY } = e
            const { x, y, r, b } = this.selectRect
            let selectAnchor, selectIndex = -1
            if (this.anchors) {
                this.anchors.forEach(([x, y], i) => {
                    if (Math.abs(pageX - x) <= 10 && Math.abs(pageY - y) <= 10) {
                        selectAnchor = [x, y]
                        selectIndex = i
                    }
                })
            }
            if (selectAnchor) {
                this.selectAnchorIndex = selectIndex
                document.body.style.cursor = ANCHORS[selectIndex].cursor
                this.emit('moving')
                return
            }
            if (pageX > x && pageX < r && pageY > y && pageY < b) document.body.style.cursor = 'move'
            else document.body.style.cursor = 'auto'
            this.emit('moving')
        }
    }

    onMouseUp(e) {
        if (this.disabled || !this.mouseDown) return
        this.mouseDown = false
        e.stopPropagation()
        e.preventDefault()
        this.emit('mouse-up')
        if (!this.startPoint.moved) return this.emit('end-moving')
        this.emit('end-dragging')
        this.drawRect()
        this.startPoint = null
    }

    getImageUrl() {
        const scaleFactor = this.scaleFactor
        const { x, y, w, h } = this.selectRect
        if (w && h) {
            let imageData = this.bgCtx.getImageData(x * scaleFactor, y * scaleFactor, w * scaleFactor, h * scaleFactor)
            let canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            let ctx = canvas.getContext('2d')
            ctx.putImageData(imageData, 0, 0)
            return canvas.toDataURL()
        }
        return ''
    }

    disable() {
        this.disabled = true
    }

    enable() {
        this.disabled = false
    }

    reset() {
        this.anchors = null
        this.startPoint = null
        this.selectRect = null
        this.startDragRect = null
        this.selectAnchorIndex = -1
        this.drawRect()
        this.emit('reset')
    }
}

const test = () => {
    ipcRenderer.send("test")
}

const getCurrentScreenInstance = () => {
    return ipcRenderer.invoke("getCurrentScreen")
}

const getSources = () => {
    return ipcRenderer.invoke("getSources")
}

const captureScreenEvt = (obj) => {
    return ipcRenderer.send('capture-screen', obj)
}

contextBridge.exposeInMainWorld('electronAPI', {
    test,
    init,
    getCurrentScreenInstance,
    getSources,
    getStream,
    selectCapture
})
