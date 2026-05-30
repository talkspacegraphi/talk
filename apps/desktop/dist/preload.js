"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getScreenSources: () => electron_1.ipcRenderer.invoke('get-screen-sources'),
    windowMinimize: () => electron_1.ipcRenderer.send('window-minimize'),
    windowMaximize: () => electron_1.ipcRenderer.send('window-maximize'),
    windowClose: () => electron_1.ipcRenderer.send('window-close'),
});
