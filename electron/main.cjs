const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { readFolderEntries } = require('./folder-entry.cjs');
const { createVideoEditRuntime } = require('./video-edit-runtime.cjs');
const { AppSettingsStore } = require('./app-settings-store.cjs');
const { registerFrameReviewIpc } = require('./frame-review-ipc.cjs');
const { registerClipExtractionIpc } = require('./clip-extraction-ipc.cjs');
const { createClipExtractionRuntime } = require('./clip-extraction-runtime.cjs');
const { NativeProductLocator } = require('./native-product-locator.cjs');
const { ThumbnailCacheRuntime } = require('./thumbnail-cache-runtime.cjs');

const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000]/;
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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

async function pickMovieFromDialog(browserWindow) {
  if (global.__clipSandboxNextMoviePath) {
    const moviePath = global.__clipSandboxNextMoviePath;
    global.__clipSandboxNextMoviePath = null;
    return moviePath;
  }
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Movies', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'] }],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

function createMainWindow(frameReviewRuntime) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    // Keep the native caption buttons; --native-frame is the independent fallback.
    ...(process.platform === 'win32' && !process.argv.includes('--native-frame') ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0f172a', symbolColor: '#e5e7eb', height: 51 },
    } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const frameReviewHost = frameReviewRuntime.createHost();
  const webContentsId = win.webContents.id;
  frameReviewRuntime.hosts.set(webContentsId, frameReviewHost);
  win.once('closed', () => {
    frameReviewRuntime.releaseHost(webContentsId, frameReviewHost);
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function validateTopLevelFilename(filename) {
  const normalizedFilename = String(filename || '').trim();
  const basenamePrefix = normalizedFilename.split('.')[0] || '';
  if (
    !normalizedFilename
    || normalizedFilename === '.'
    || normalizedFilename === '..'
    || WINDOWS_INVALID_FILENAME_CHARS.test(normalizedFilename)
    || /[. ]$/.test(normalizedFilename)
    || /[. ]$/.test(basenamePrefix)
    || WINDOWS_RESERVED_BASENAME.test(basenamePrefix)
  ) {
    throw new Error(`Invalid top-level filename: ${filename}`);
  }
  return normalizedFilename;
}

function registerIpc(frameReviewRuntime, thumbnailRuntime, nativeProducts) {
  const nativeEnvironment = nativeProducts.environment();
  const videoEditRuntime = createVideoEditRuntime({
    resolveBinary: () => nativeProducts.ffmpeg(),
    processEnvironment: nativeEnvironment,
  });
  const settingsStore = new AppSettingsStore(app.getPath('userData'));
  const clipExtractionRuntime = createClipExtractionRuntime({
    getSettings: () => settingsStore.load(),
    resolveFfmpeg: () => nativeProducts.ffmpeg(),
    resolveFfprobe: () => nativeProducts.ffprobe(),
    environment: nativeEnvironment,
  });
  ipcMain.handle('clip-sandbox:load-app-settings', () => settingsStore.load());
  ipcMain.handle('clip-sandbox:save-app-settings', (_event, settings) => settingsStore.save(settings));
  ipcMain.handle('clip-sandbox:choose-pipelines-root', async event => {
    try {
      const selectedPath = await pickFolderFromDialog(BrowserWindow.fromWebContents(event.sender));
      return selectedPath ? { path: selectedPath } : { canceled: true };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Could not choose a folder.' }; }
  });

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
    const filename = validateTopLevelFilename(payload.filename);
    await fs.writeFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:append-text-file', async (_event, payload = {}) => {
    const folderPath = String(payload.folderPath || '').trim();
    const filename = validateTopLevelFilename(payload.filename);
    await fs.appendFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:delete-files', async (_event, payload = {}) => {
    const folderPath = String(payload.folderPath || '').trim();
    const rawFilenames = Array.from(payload.filenames || []).map((filename) => String(filename || '').trim()).filter(Boolean);
    try {
      rawFilenames.forEach((filename) => validateTopLevelFilename(filename));
    } catch (error) {
      return {
        ok: false,
        code: 'partial',
        results: rawFilenames.map((filename) => ({
          filename,
          ok: false,
          code: 'delete-failed',
          error: {
            message: error?.message || String(error),
          },
        })),
      };
    }
    const filenames = rawFilenames;
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

  ipcMain.handle('clip-sandbox:test-set-next-movie-path', async (_event, moviePath) => {
    global.__clipSandboxNextMoviePath = moviePath || null;
    return { ok: true };
  });

  ipcMain.handle('clip-sandbox:thumbnail-save', async (_event, payload = {}) => {
    try {
      return { ok: true, ...(await thumbnailRuntime.save(payload.bytes)) };
    } catch {
      return { ok: false, error: { message: 'Thumbnail could not be saved.' } };
    }
  });

  ipcMain.handle('clip-sandbox:thumbnail-load', async (_event, id) => {
    try {
      return { ok: true, ...(await thumbnailRuntime.load(id)) };
    } catch {
      return { ok: false, error: { message: 'Thumbnail could not be loaded.' } };
    }
  });

  ipcMain.handle('clip-sandbox:thumbnail-delete', async (_event, id) => {
    try {
      await thumbnailRuntime.delete(id);
      return { ok: true };
    } catch {
      return { ok: false, error: { message: 'Thumbnail could not be deleted.' } };
    }
  });

  registerFrameReviewIpc({
    ipcMain,
    hostForEvent: frameReviewRuntime.hostForEvent,
    chooseSourcePath: event => pickMovieFromDialog(BrowserWindow.fromWebContents(event.sender)),
  });
  registerClipExtractionIpc({
    ipcMain,
    runtime: clipExtractionRuntime,
    hostForEvent: frameReviewRuntime.hostForEvent,
  });
  return { dispose: () => clipExtractionRuntime.dispose() };
}

async function createFrameReviewRuntime(nativeProducts) {
  const projectFolder = path.resolve(__dirname, '..');
  const hostModuleUrl = pathToFileURL(path.join(projectFolder, 'build', 'src', 'frame-review', 'host', 'frame-review-host.js')).href;
  const { FrameReviewHost } = await import(hostModuleUrl);
  let configuration;
  if (app.isPackaged) {
    const frameReviewFolder = path.join(process.resourcesPath, 'frame-review');
    let packagedManifest = null;
    try {
      packagedManifest = JSON.parse(await fs.readFile(
        path.join(frameReviewFolder, 'dependency-manifest.json'), 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const packagedVersion = app.getVersion();
    configuration = {
      applicationFolder: path.dirname(app.getPath('exe')),
      nativeBinaryFolder: path.join(frameReviewFolder, 'bin'),
      ffmpegExecutable: nativeProducts.ffmpeg(),
      ffprobeExecutable: nativeProducts.ffprobe(),
      libVlcDll: path.join(frameReviewFolder, 'libvlc', 'libvlc.dll'),
      libVlcPluginFolder: path.join(frameReviewFolder, 'libvlc', 'plugins'),
      bestSourceVersion: packagedManifest?.dependencies?.bestsource?.commit
        || `packaged-bestsource-${packagedVersion}`,
      ffmpegVersion: packagedManifest?.dependencies?.ffmpeg?.sourceArchiveSha512
        || `packaged-ffmpeg-${packagedVersion}`,
      runtimePathEntries: [path.join(frameReviewFolder, 'bin')],
    };
  } else {
    let dependencyManifest = null;
    try {
      dependencyManifest = JSON.parse(await fs.readFile(
        path.join(projectFolder, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json'), 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const dependencyRoot = path.join(projectFolder, 'tools', 'frame-review', '.deps');
    const ffmpegRoot = path.join(dependencyRoot, 'vcpkg-installed', 'x64-mingw-release');
    const libVlcRoot = path.join(dependencyRoot, 'libvlc');
    configuration = {
      applicationFolder: projectFolder,
      nativeBinaryFolder: path.join(projectFolder, 'native-build', 'frame-review', 'bin'),
      ffmpegExecutable: nativeProducts.ffmpeg(),
      ffprobeExecutable: nativeProducts.ffprobe(),
      libVlcDll: dependencyManifest?.libvlc?.dll || path.join(libVlcRoot, 'libvlc.dll'),
      libVlcPluginFolder: dependencyManifest?.libvlc?.plugins || path.join(libVlcRoot, 'plugins'),
      bestSourceVersion: dependencyManifest?.sources?.bestsource?.commit || 'bestsource-dependencies-unresolved',
      ffmpegVersion: dependencyManifest?.manifestSha256 || 'ffmpeg-dependencies-unresolved',
      runtimePathEntries: [
        dependencyManifest?.ffmpeg?.runtimeDllRoot || path.join(ffmpegRoot, 'bin'),
        dependencyManifest?.compiler?.runtimeDllRoot || '',
        path.join(dependencyManifest?.bestsource?.root || path.join(dependencyRoot, 'bestsource-install'), 'bin'),
      ],
    };
  }
  const hosts = new Map();
  const pendingDisposals = new Set();
  return {
    hosts,
    createHost: () => new FrameReviewHost(configuration),
    hostForEvent: (event) => {
      const host = hosts.get(event?.sender?.id);
      if (!host) throw new Error('No frame-review host exists for this window.');
      return host;
    },
    releaseHost: (webContentsId, host) => {
      if (hosts.get(webContentsId) === host) hosts.delete(webContentsId);
      const disposal = host.dispose().finally(() => pendingDisposals.delete(disposal));
      pendingDisposals.add(disposal);
    },
    dispose: async () => {
      const activeHosts = [...hosts.values()];
      hosts.clear();
      await Promise.allSettled([...activeHosts.map(host => host.dispose()), ...pendingDisposals]);
    },
  };
}

app.whenReady().then(async () => {
  const projectFolder = path.resolve(__dirname, '..');
  const nativeProducts = new NativeProductLocator({
    projectFolder,
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
  });
  const frameReviewRuntime = await createFrameReviewRuntime(nativeProducts);
  const thumbnailRuntime = new ThumbnailCacheRuntime(app.getPath('userData'));
  await thumbnailRuntime.initialize();
  const clipExtractionRuntime = registerIpc(frameReviewRuntime, thumbnailRuntime, nativeProducts);
  let shutdownComplete = false;
  let shutdownPromise = null;
  app.on('before-quit', event => {
    if (shutdownComplete) return;
    event.preventDefault();
    shutdownPromise ??= Promise.allSettled([frameReviewRuntime.dispose(), clipExtractionRuntime.dispose()])
      .then(() => thumbnailRuntime.cleanup())
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  });
  createMainWindow(frameReviewRuntime);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(frameReviewRuntime);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
