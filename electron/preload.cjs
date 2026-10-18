const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posNative', {
  platform: process.platform,
  printSilent: () => ipcRenderer.invoke('print-silent'),
});
