// The only doorway between the window and your computer. The window can call
// these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bimini', {
  status: () => ipcRenderer.invoke('status'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  loadTranscript: id => ipcRenderer.invoke('load-transcript', id),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickClaude: () => ipcRenderer.invoke('pick-claude'),
  send: opts => ipcRenderer.invoke('send', opts),
  stop: runId => ipcRenderer.invoke('stop', runId),
  onEvent: fn => ipcRenderer.on('claude-event', (_e, ev) => fn(ev)),
  onMenu: fn => ipcRenderer.on('menu', (_e, action) => fn(action)),
});
