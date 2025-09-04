const { contextBridge, ipcRenderer } = require('electron');

// Expose only the APIs you want renderer to access
contextBridge.exposeInMainWorld('api', {
  getMonitorStatus: () => ipcRenderer.invoke('get-monitor-status')
});
