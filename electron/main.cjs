const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { readFolderEntries } = require('./folder-entry.cjs');
const { createVideoEditRuntime } = require('./video-edit-runtime.cjs');

async function pickFolderFromDialog(browserWindow) {
  if (global.__clipSandboxNextFolderPath) {
    const folderPath = global.__clipSandboxNextFolderPath;
    global.__clipSandboxNextFolderPath = null;
    return folderPath;
  }

  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function registerIpc() {
  const videoEditRuntime = createVideoEditRuntime();

  ipcMain.handle('clip-sandbox:pick-folder', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const folderPath = await pickFolderFromDialog(browserWindow);
    if (!folderPath) return { canceled: true };

    return {
      canceled: false,
      folderPath,
      folderName: path.basename(folderPath),
      files: await readFolderEntries(folderPath),
    };
  });

  ipcMain.handle('clip-sandbox:save-text-file', async (_event, payload = {}) => {
    const folderPath = String(payload.folderPath || '').trim();
    const filename = String(payload.filename || '').trim();
    await fs.writeFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:append-text-file', async (_event, payload = {}) => {
    const folderPath = String(payload.folderPath || '').trim();
    const filename = String(payload.filename || '').trim();
    await fs.appendFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:delete-files', async (_event, payload = {}) => {
    const folderPath = String(payload.folderPath || '').trim();
    const filenames = Array.from(payload.filenames || []).map((filename) => String(filename || '').trim()).filter(Boolean);
    const results = [];

    for (const filename of filenames) {
      try {
        await fs.unlink(path.join(folderPath, filename));
        results.push({ filename, ok: true });
      } catch (error) {
        results.push({
          filename,
          ok: false,
          code: 'delete-failed',
          error: {
            message: error?.message || String(error),
          },
        });
      }
    }

    return {
      ok: results.every((result) => result.ok),
      code: results.every((result) => result.ok) ? 'deleted' : 'partial',
      results,
    };
  });

  ipcMain.handle('clip-sandbox:create-video-edit', async (_event, payload = {}) => {
    return videoEditRuntime.createVideoEdit(payload);
  });

  ipcMain.handle('clip-sandbox:test-set-next-folder-path', async (_event, folderPath) => {
    global.__clipSandboxNextFolderPath = folderPath || null;
    return { ok: true };
  });
}

app.whenReady().then(() => {
  registerIpc();
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
