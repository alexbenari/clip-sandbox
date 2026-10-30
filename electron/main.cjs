const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { readFolderEntries } = require('./folder-entry.cjs');
const { FolderAccessRegistry } = require('./folder-access-registry.cjs');
const { PipelineCatalogRuntime } = require('./pipeline-catalog-runtime.cjs');
const { AppSettingsStore } = require('./app-settings-store.cjs');
const { registerFrameReviewIpc } = require('./frame-review-ipc.cjs');
const { registerClipExtractionIpc } = require('./clip-extraction-ipc.cjs');
const { ClipCapturesStore } = require('./clip-captures-store.cjs');
const { registerClipCapturesIpc } = require('./clip-captures-ipc.cjs');
const { createClipExtractionRuntime } = require('./clip-extraction-runtime.cjs');
const { ClipSourceMovieRuntime } = require('./clip-source-movie-runtime.cjs');
const { SourceMovieLocator } = require('./source-movie-locator.cjs');
const { LocatedMovieStore } = require('./located-movie-store.cjs');
const { MovieWindowCache } = require('./movie-window-cache.cjs');
const { MovieFrameRateProbe } = require('./movie-frame-rate-probe.cjs');
const { ZoomEditSources } = require('./zoom-edit-sources.cjs');
const { EditedClipSaver } = require('./edited-clip-saver.cjs');
const { EditedClipPlacement } = require('./edited-clip-placement.cjs');
const { ExactRangeEncoder } = require('./exact-range-encoder.cjs');
const { registerZoomEditSaveIpc } = require('./zoom-edit-save-ipc.cjs');
const { StagedEditResolver } = require('./staged-edit-resolver.cjs');
const { ZoomEditPreviews } = require('./zoom-edit-previews.cjs');
const { registerZoomEditPreviewIpc } = require('./zoom-edit-preview-ipc.cjs');
const { MovieWindowPlacement } = require('./movie-window-placement.cjs');
const { NativeProductLocator } = require('./native-product-locator.cjs');
const { ThumbnailCacheRuntime } = require('./thumbnail-cache-runtime.cjs');
const { TestRecycleBin } = require('./test-recycle-bin.cjs');

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
    show: false,
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

  win.maximize();
  win.show();

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

async function loadEditComposition(projectFolder) {
  const moduleUrl = pathToFileURL(path.join(projectFolder, 'build', 'src', 'domain', 'zoom-edit-composition.js')).href;
  return (await import(moduleUrl)).ZoomEditComposition;
}

async function registerIpc({ frameReviewRuntime, thumbnailRuntime, nativeProducts, editComposition, zoomEditPreviewFolder }) {
  const nativeEnvironment = nativeProducts.environment();
  // End-to-end tests keep moved files in their own profile, so they never touch the real Recycle Bin.
  const testRecycleBin = process.env.CLIP_SANDBOX_E2E === '1'
    ? new TestRecycleBin(path.join(app.getPath('userData'), 'test-recycle-bin'))
    : null;
  const trashItem = itemPath => (testRecycleBin ? testRecycleBin.trashItem(itemPath) : shell.trashItem(itemPath));

  const settingsStore = new AppSettingsStore(app.getPath('userData'));
  const clipCapturesStore = new ClipCapturesStore(app.getPath('userData'));
  // The encoder holds only tool locations, so extraction and edited-clip saving share one.
  const exactRangeEncoder = new ExactRangeEncoder({
    resolveFfmpeg: () => nativeProducts.ffmpeg(),
    resolveFfprobe: () => nativeProducts.ffprobe(),
    environment: nativeEnvironment,
  });
  const clipExtractionRuntime = createClipExtractionRuntime({
    getSettings: () => settingsStore.load(),
    encoder: exactRangeEncoder,
  });
  const folderAccess = new FolderAccessRegistry();
  const pipelineCatalogRuntime = new PipelineCatalogRuntime({ settingsStore, folderAccess });
  const clipSourceMovieRuntime = new ClipSourceMovieRuntime({ folderAccess });
  const frameRateProbe = new MovieFrameRateProbe({ resolveFfprobe: () => nativeProducts.ffprobe(), environment: nativeEnvironment });
  const zoomEditSources = new ZoomEditSources({
    folderAccess,
    hostForEvent: frameReviewRuntime.hostForEvent,
    locator: new SourceMovieLocator({
      folderAccess,
      capturesStore: clipCapturesStore,
      locatedMovies: new LocatedMovieStore(app.getPath('userData')),
      hostForEvent: frameReviewRuntime.hostForEvent,
      chooseSourcePath: event => pickMovieFromDialog(BrowserWindow.fromWebContents(event.sender)),
    }),
    windowCache: new MovieWindowCache({
      folder: path.join(frameReviewRuntime.applicationFolder, 'movie-window-cache'),
      resolveFfmpeg: () => nativeProducts.ffmpeg(),
      environment: nativeEnvironment,
      forgetPreparedReview: windowPath => frameReviewRuntime.forgetPreparedReview(windowPath),
    }),
    placement: new MovieWindowPlacement({
      probeFrameRate: (moviePath, selectedStream) => frameRateProbe.framesPerSecond(moviePath, selectedStream),
    }),
  });
  const stagedEdits = new StagedEditResolver({
    folderAccess,
    hostForEvent: frameReviewRuntime.hostForEvent,
    sources: zoomEditSources,
    editComposition,
  });
  const editedClipSaver = new EditedClipSaver({
    stagedEdits,
    encoder: exactRangeEncoder,
    placement: new EditedClipPlacement({ trashItem }),
  });
  const zoomEditPreviews = new ZoomEditPreviews({
    folder: zoomEditPreviewFolder,
    stagedEdits,
    resolveFfmpeg: () => nativeProducts.ffmpeg(),
    environment: nativeEnvironment,
  });
  // Previews belong to one app session, so those of an earlier session are removed.
  await zoomEditPreviews.initialize();
  ipcMain.handle('clip-sandbox:clip-source-movies-read', (event, request) =>
    clipSourceMovieRuntime.read(event, request));
  frameReviewRuntime.onHostReleased(webContentsId => {
    zoomEditSources.forgetAppWindow(webContentsId);
    void zoomEditPreviews.release(webContentsId);
  });
  ipcMain.handle('clip-sandbox:zoom-edit-open-clip', (event, request) => zoomEditSources.openClip(event, request));
  ipcMain.handle('clip-sandbox:zoom-edit-open-window', (event, request) => zoomEditSources.openWindow(event, request));
  ipcMain.handle('clip-sandbox:zoom-edit-anchor-window', (event, request) => zoomEditSources.anchorWindow(event, request));
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

    const resolvedFolderPath = folderAccess.remember(event.sender, folderPath);
    return {
      canceled: false,
      folderPath: resolvedFolderPath,
      folderName: path.basename(resolvedFolderPath),
      files: await readFolderEntries(resolvedFolderPath),
    };
  });
  ipcMain.handle('clip-sandbox:list-pipeline-catalog', event => pipelineCatalogRuntime.listPipelines(event.sender));
  ipcMain.handle('clip-sandbox:describe-pipeline-catalog-entry', (event, payload = {}) =>
    pipelineCatalogRuntime.describePipeline(event.sender, payload.pipelineId));
  ipcMain.handle('clip-sandbox:open-pipeline-catalog-entry', (event, payload = {}) =>
    pipelineCatalogRuntime.openPipeline(event.sender, payload.pipelineId));

  ipcMain.handle('clip-sandbox:refresh-folder', async (event, payload = {}) => {
    const folderPath = folderAccess.requireKnownPath(event.sender, payload.folderPath);
    return {
      folderPath,
      folderName: path.basename(folderPath),
      files: await readFolderEntries(folderPath),
    };
  });

  ipcMain.handle('clip-sandbox:save-text-file', async (event, payload = {}) => {
    const folderPath = folderAccess.requireKnownPath(event.sender, payload.folderPath);
    const filename = validateTopLevelFilename(payload.filename);
    await fs.writeFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:append-text-file', async (event, payload = {}) => {
    const folderPath = folderAccess.requireKnownPath(event.sender, payload.folderPath);
    const filename = validateTopLevelFilename(payload.filename);
    await fs.appendFile(path.join(folderPath, filename), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  });

  ipcMain.handle('clip-sandbox:trash-files', async (event, payload = {}) => {
    const folderPath = folderAccess.requireKnownPath(event.sender, payload.folderPath);
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
          code: 'trash-failed',
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
        await trashItem(path.join(folderPath, filename));
        results.push({ filename, ok: true });
      } catch (error) {
        results.push({
          filename,
          ok: false,
          code: 'trash-failed',
          error: {
            message: error?.message || String(error),
          },
        });
      }
    }

    return {
      ok: results.every((result) => result.ok),
      code: results.every((result) => result.ok) ? 'trashed' : 'partial',
      results,
    };
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
  registerZoomEditSaveIpc({ ipcMain, saver: editedClipSaver });
  registerZoomEditPreviewIpc({ ipcMain, previews: zoomEditPreviews });
  registerClipCapturesIpc({
    ipcMain,
    store: clipCapturesStore,
    hostForEvent: frameReviewRuntime.hostForEvent,
  });
  return { dispose: async () => {
    await Promise.allSettled([
      clipExtractionRuntime.dispose(), editedClipSaver.dispose(), zoomEditPreviews.dispose(), clipCapturesStore.flush(),
    ]);
  } };
}

async function createFrameReviewRuntime(nativeProducts) {
  const projectFolder = path.resolve(__dirname, '..');
  const hostModuleUrl = pathToFileURL(path.join(projectFolder, 'build', 'src', 'frame-review', 'host', 'frame-review-host.js')).href;
  const { FrameReviewHost } = await import(hostModuleUrl);
  let configuration;
  if (app.isPackaged) {
    const frameReviewFolder = path.join(process.resourcesPath, 'frame-review');
    const packagedManifest = nativeProducts.dependencyManifest();
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
    const dependencyManifest = nativeProducts.dependencyManifest();
    const dependencyRoot = path.join(projectFolder, 'tools', 'frame-review', '.deps');
    const ffmpegRoot = path.join(dependencyRoot, 'vcpkg-installed', 'x64-mingw-release');
    const libVlcRoot = path.join(dependencyRoot, 'libvlc');
    configuration = {
      // End-to-end tests keep prepared-review caches in their own profile, so each test starts cold and
      // removes its caches with the profile instead of sharing the project folder's caches.
      applicationFolder: process.env.CLIP_SANDBOX_E2E === '1' ? app.getPath('userData') : projectFolder,
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
  const releaseListeners = [];
  // Cache upkeep needs no window, so it runs on one host that no window owns.
  let maintenanceHost = null;
  return {
    hosts,
    applicationFolder: configuration.applicationFolder,
    createHost: () => new FrameReviewHost(configuration),
    forgetPreparedReview: (sourcePath) => {
      maintenanceHost ??= new FrameReviewHost(configuration);
      return maintenanceHost.forgetPreparedReview(sourcePath);
    },
    onHostReleased: (listener) => { releaseListeners.push(listener); },
    hostForEvent: (event) => {
      const host = hosts.get(event?.sender?.id);
      if (!host) throw new Error('No frame-review host exists for this window.');
      return host;
    },
    releaseHost: (webContentsId, host) => {
      if (hosts.get(webContentsId) === host) hosts.delete(webContentsId);
      for (const listener of releaseListeners) listener(webContentsId);
      const disposal = host.dispose().finally(() => pendingDisposals.delete(disposal));
      pendingDisposals.add(disposal);
    },
    dispose: async () => {
      const activeHosts = [...hosts.values(), ...(maintenanceHost ? [maintenanceHost] : [])];
      hosts.clear();
      maintenanceHost = null;
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
  const clipExtractionRuntime = await registerIpc({
    frameReviewRuntime,
    thumbnailRuntime,
    nativeProducts,
    editComposition: await loadEditComposition(projectFolder),
    zoomEditPreviewFolder: path.join(app.getPath('userData'), 'zoom-edit-previews'),
  });
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
