type fileInfo = {
    data: string,
    fileName: string
}
declare interface Window {
    electronAPI: {
        test: () => void,
        tempTest: () => void,
        getSources: () => Promise<any>,
        getCurrentScreenInstance: () => any,
        getStream: (sources: any, currentScreen: any) => Promise<any>,
        selectCapture: () => any,
        init: (
            $canvas: HTMLCanvasElement,
            $bg: HTMLDivElement,
            $sizeInfo: HTMLDivElement,
            $toolbar: HTMLDivElement,
            $btnClose: HTMLDivElement,
            $btnOk: HTMLDivElement,
            $btnSave: HTMLDivElement,
            $btnReset: HTMLDivElement,
            $mask: HTMLDivElement
        ) => void,
    }
}