const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posNative', {
  isElectron: true,
  platform: process.platform,
  printSilent: () => ipcRenderer.invoke('print-silent'),
  exitApp: () => ipcRenderer.invoke('app-exit'),
});
