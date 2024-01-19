const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, dialog, clipboard, nativeImage } = require('electron')
const path = require("path")
const fs = require('fs')

let win

let captureWins = []

const captureScreen = () => {
    if (captureWins.length) return

    const { screen } = require('electron')
    captureWins = screen.getAllDisplays().map((display) => {
        let captureWin = new BrowserWindow({
            fullscreen: true,
            width: display.bounds.width,
            height: display.bounds.height,
            x: display.bounds.x,
            y: display.bounds.y,
            transparent: true,
            frame: false,
            skipTaskbar: true,
            movable: false,
            resizable: false,
            enableLargerThanScreen: true,
            hasShadow: false,
            webPreferences: {
                nodeIntegrationInWorker: true,
                devTools: true,
                preload: path.join(__dirname, "../dist/preload.js"),
            },
        })
        captureWin.setAlwaysOnTop(true, 'screen-saver')
        captureWin.setVisibleOnAllWorkspaces(true)
        captureWin.setFullScreenable(false)

        // captureWin.webContents.openDevTools()

        captureWin.loadFile(path.resolve(__dirname, '../dist/capture.html'))
        globalShortcut.register('Esc', () => {
            if (captureWins) {
                captureWins.forEach(win => win.close())
                captureWins = []
            }
            globalShortcut.unregister("Esc")
        })
        let { x, y } = screen.getCursorScreenPoint()
        if (x >= display.bounds.x && x <= display.bounds.x + display.bounds.width && y >= display.bounds.y && y <= display.bounds.y + display.bounds.height) captureWin.focus()
        else captureWin.blur()
        captureWin.on('closed', () => {
            let index = captureWins.indexOf(captureWin)
            if (~index) captureWins.splice(index, 1)
            captureWins.forEach(win => win.close())
        })
        return captureWin
    })
}

ipcMain.on('capture-screen', (_, { type = 'start', screenId } = {}) => {
    if (type === 'start') {
        captureScreen()
    } else if (type === 'select') {
        captureWins.forEach(win => win.webContents.send('capture-screen', { type: 'select', screenId }))
    }
})


ipcMain.on("test", captureScreen)

function createWindow() {
    globalShortcut.register('CmdOrCtrl+Shift+A', captureScreen)

    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegrationInWorker: true,
            devTools: true,
            preload: path.join(__dirname, "../dist/preload.js"),
        },
    })

    win.loadFile(path.resolve(__dirname, "../dist/index.html"))

    // 打开开发者工具
    // win.webContents.openDevTools()

    win.on('closed', () => { win = null })
}

ipcMain.handle("getCurrentScreen", () => {
    let { x, y } = BrowserWindow.getFocusedWindow().getBounds()
    return screen.getAllDisplays().filter(d => d.bounds.x === x && d.bounds.y === y)[0]
})

ipcMain.on("saveInfo", (_, url) => {
    BrowserWindow.getFocusedWindow().hide()
    clipboard.writeImage(nativeImage.createFromDataURL(url))
})

ipcMain.handle("savePicInfo", (_, url) => {
    return new Promise(resolve => {
        BrowserWindow.getFocusedWindow().hide()
        dialog.showSaveDialog({
            filters: [{
                name: 'Images',
                extensions: ['png'],
            }],
        }).then(({ filePath }) => {
            if (filePath) fs.writeFileSync(filePath, nativeImage.createFromDataURL(url).toPNG())
            resolve()
        })
    })
})

ipcMain.handle("getSources", () => {
    return new Promise(resolve => {
        desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 },
        }).then(sources => {
            resolve(sources)
        })
    })
})

app.on('ready', createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (win === null) createWindow()
})




