const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    title: 'Clip Sandbox — Panel pilot',
    backgroundColor: '#0b0f14',
    ...(process.argv.includes('--title-overlay') ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0f172a', symbolColor: '#e5e7eb', height: 51 } } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const fixture = process.env.PILOT_SURFACE === 'shell' || process.argv.includes('--shell') ? 'shell.html' : process.env.PILOT_SURFACE === 'spectrum' || process.argv.includes('--spectrum') ? 'spectrum.html' : process.env.PILOT_SURFACE === 'popover' ? 'popover.html' : process.env.PANEL_IMPL === 'local' ? 'local.html' : 'index.html';
  window.loadFile(path.join(__dirname, fixture), { query: { grid: process.argv.includes('--grid') ? '1' : '0' } });
});
app.on('window-all-closed', () => app.quit());
