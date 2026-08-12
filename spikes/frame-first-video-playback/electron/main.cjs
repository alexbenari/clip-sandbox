const { app, BrowserWindow } = require('electron');
const path = require('path');

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#11161b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return window;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
