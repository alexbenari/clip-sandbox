const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const VIDEO_EXT_TO_MIME = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.avi', 'video/x-msvideo'],
  ['.mkv', 'video/x-matroska'],
  ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'],
]);

function isTopLevelFile(dirent) {
  return dirent?.isFile?.() === true;
}

async function readFolderEntries(folderPath) {
  const dirents = await fs.readdir(folderPath, { withFileTypes: true });
  const fileEntries = dirents.filter(isTopLevelFile);
  const files = [];

  for (const dirent of fileEntries) {
    const absolutePath = path.join(folderPath, dirent.name);
    const stat = await fs.stat(absolutePath);
    const ext = path.extname(dirent.name).toLowerCase();
    const type = ext === '.txt' ? 'text/plain' : (VIDEO_EXT_TO_MIME.get(ext) || '');
    const entry = {
      name: dirent.name,
      path: absolutePath,
      relativePath: dirent.name,
      mediaSource: pathToFileURL(absolutePath).href,
      type,
      lastModifiedMs: stat.mtimeMs,
      size: stat.size,
    };

    if (ext === '.txt') {
      entry.text = await fs.readFile(absolutePath, 'utf8');
    }

    files.push(entry);
  }

  return files;
}

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
