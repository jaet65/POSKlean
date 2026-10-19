const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posNative', {
  isElectron: true,
  platform: process.platform,
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTicket: (options) => ipcRenderer.invoke('print-ticket', options),
  printSilent: (options) => ipcRenderer.invoke('print-silent', options),
  exitApp: () => ipcRenderer.invoke('app-exit'),
  exitFullScreen: () => ipcRenderer.invoke('app-exit-fullscreen'),
  toggleFullScreen: () => ipcRenderer.invoke('app-toggle-fullscreen'),
  isFullScreen: () => ipcRenderer.invoke('app-is-fullscreen'),
  shutdownSystem: () => ipcRenderer.invoke('app-shutdown-system'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('updater-status', subscription);
    return () => ipcRenderer.removeListener('updater-status', subscription);
  },
});
