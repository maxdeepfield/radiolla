const { contextBridge, ipcRenderer } = require('electron');

// Expose only the IPC surface the renderer needs, with bound methods to preserve `this`.
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (...args) => ipcRenderer.on(...args),
  removeListener: (...args) => ipcRenderer.removeListener(...args),
  send: (...args) => ipcRenderer.send(...args),
  invoke: (...args) => ipcRenderer.invoke(...args),
});
