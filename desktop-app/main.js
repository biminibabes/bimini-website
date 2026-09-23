const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const claude = require('./lib/claude');
const sessions = require('./lib/sessions');

let win = null;
let claudeBin = null;
const runs = new Map(); // runId -> handle

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0d0b0e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Links open in your browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

function buildMenu() {
  const send = action => () => win && win.webContents.send('menu', action);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Flyer', submenu: [
      { label: 'New Flyer…', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: send('open-folder') },
      { label: 'Back to the Wall', accelerator: 'CmdOrCtrl+Shift+H', click: send('home') },
    ] },
    { role: 'editMenu' },
    // No Reload here on purpose: it would wipe open flyers while Claude is mid-task.
    { label: 'View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' },
    ] },
    { role: 'windowMenu' },
  ]));
}

ipcMain.handle('status', () => {
  claudeBin = claude.findClaude();
  return { found: !!claudeBin, path: claudeBin, version: claudeBin ? claude.claudeVersion(claudeBin) : null };
});

ipcMain.handle('list-sessions', async () => {
  const list = await sessions.listSessions(80);
  return { sessions: list, projects: sessions.projectsFrom(list) };
});

ipcMain.handle('load-transcript', (_e, id) => sessions.loadTranscript(String(id)));

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Where should this flyer work?' });
  return r.canceled ? null : r.filePaths[0];
});

const MODES = new Set(['manual', 'acceptEdits', 'plan']);

ipcMain.handle('send', (_e, { runId, cwd, text, sessionId, mode, allowedTools }) => {
  if (!claudeBin) claudeBin = claude.findClaude();
  if (!claudeBin) throw new Error('Claude Code is not installed, or the app cannot find it.');
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('That folder no longer exists.');
  if (typeof runId !== 'string' || runs.has(runId)) throw new Error('Bad run id.');
  const handle = claude.runTurn({
    bin: claudeBin,
    cwd,
    text: String(text || ''),
    sessionId: sessionId || null,
    mode: MODES.has(mode) ? mode : 'manual',
    allowedTools: Array.isArray(allowedTools) ? allowedTools.map(String) : [],
  }, ev => {
    if (ev.kind === 'done') runs.delete(runId);
    if (win && !win.isDestroyed()) win.webContents.send('claude-event', { runId, ...ev });
  });
  runs.set(runId, handle);
});

ipcMain.handle('stop', (_e, runId) => { runs.get(runId)?.stop(); });

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { for (const h of runs.values()) h.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
