// The main-process entry point is plain functions because it is the composition root: it builds the classes and wires them to Electron.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { readFolderEntries } = require('./folder-entry.cjs');
const { FolderAccessRegistry } = require('./folder-access-registry.cjs');
const { PipelineCatalogRuntime } = require('./pipeline-catalog-runtime.cjs');
const { AppSettingsStore } = require('./app-settings-store.cjs');
const { FrameReviewIpc } = require('./frame-review-ipc.cjs');
const { FrameReviewRuntime } = require('./frame-review-runtime.cjs');
const { FolderFileOperations } = require('./folder-file-operations.cjs');
const { ClipExtractionIpc } = require('./clip-extraction-ipc.cjs');
const { ClipCapturesStore } = require('./clip-captures-store.cjs');
const { ClipCapturesIpc } = require('./clip-captures-ipc.cjs');
const { ClipExtractionRuntime } = require('./clip-extraction-runtime.cjs');
const { ClipSourceMovieRuntime } = require('./clip-source-movie-runtime.cjs');
const { SourceMovieLocator } = require('./source-movie-locator.cjs');
const { LocatedMovieStore } = require('./located-movie-store.cjs');
const { MovieWindowCache } = require('./movie-window-cache.cjs');
const { MovieFrameRateProbe } = require('./movie-frame-rate-probe.cjs');
const { ZoomEditSources } = require('./zoom-edit-sources.cjs');
const { EditedClipSaver } = require('./edited-clip-saver.cjs');
const { EditedClipPlacement } = require('./edited-clip-placement.cjs');
const { ExactRangeEncoder } = require('./exact-range-encoder.cjs');
const { ZoomEditSaveIpc } = require('./zoom-edit-save-ipc.cjs');
const { StagedEditResolver } = require('./staged-edit-resolver.cjs');
const { ZoomEditPreviews } = require('./zoom-edit-previews.cjs');
const { ClipFileRenamer } = require('./clip-file-renamer.cjs');
const { ZoomEditPreviewIpc } = require('./zoom-edit-preview-ipc.cjs');
const { MovieWindowPlacement } = require('./movie-window-placement.cjs');
const { NativeProductLocator } = require('./native-product-locator.cjs');
const { ThumbnailCacheRuntime } = require('./thumbnail-cache-runtime.cjs');
const { TestRecycleBin } = require('./test-recycle-bin.cjs');

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

  const webContentsId = win.webContents.id;
  const frameReviewHost = frameReviewRuntime.openHost(webContentsId);
  win.once('closed', () => {
    frameReviewRuntime.releaseHost(webContentsId, frameReviewHost);
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

async function loadSharedDomain(projectFolder) {
  const importDomainModule = name => import(pathToFileURL(path.join(projectFolder, 'build', 'src', 'domain', `${name}.js`)).href);
  const [{ ZoomEditComposition }, { WindowsFileNameValidity }] = await Promise.all([
    importDomainModule('zoom-edit-composition'),
    importDomainModule('windows-file-name-validity'),
  ]);
  return { editComposition: ZoomEditComposition, fileNameValidity: new WindowsFileNameValidity() };
}

async function registerIpc({
  frameReviewRuntime, thumbnailRuntime, nativeProducts, editComposition, fileNameValidity, zoomEditPreviewFolder,
}) {
  const nativeEnvironment = nativeProducts.environment();
  const hostForEvent = event => frameReviewRuntime.hostForEvent(event);
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
  const clipExtractionRuntime = new ClipExtractionRuntime({
    getSettings: () => settingsStore.load(),
    encoder: exactRangeEncoder,
    fileNameValidity,
  });
  const folderAccess = new FolderAccessRegistry();
  const pipelineCatalogRuntime = new PipelineCatalogRuntime({ settingsStore, folderAccess, fileNameValidity });
  const clipSourceMovieRuntime = new ClipSourceMovieRuntime({ folderAccess });
  const frameRateProbe = new MovieFrameRateProbe({ resolveFfprobe: () => nativeProducts.ffprobe(), environment: nativeEnvironment });
  const zoomEditSources = new ZoomEditSources({
    folderAccess,
    hostForEvent,
    locator: new SourceMovieLocator({
      folderAccess,
      capturesStore: clipCapturesStore,
      locatedMovies: new LocatedMovieStore(app.getPath('userData')),
      hostForEvent,
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
    hostForEvent,
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
  const clipFileRenamer = new ClipFileRenamer({ folderAccess, fileNameValidity });
  ipcMain.handle('clip-sandbox:rename-clip', (event, request) => clipFileRenamer.rename(event.sender, request));
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
  ipcMain.handle('clip-sandbox:create-pipeline', (_event, payload = {}) =>
    pipelineCatalogRuntime.createPipeline(payload.name));

  ipcMain.handle('clip-sandbox:refresh-folder', async (event, payload = {}) => {
    const folderPath = folderAccess.requireKnownPath(event.sender, payload.folderPath);
    return {
      folderPath,
      folderName: path.basename(folderPath),
      files: await readFolderEntries(folderPath),
    };
  });

  const folderFiles = new FolderFileOperations({ folderAccess, fileNameValidity, trashItem });
  ipcMain.handle('clip-sandbox:save-text-file', (event, payload) => folderFiles.saveText(event.sender, payload));
  ipcMain.handle('clip-sandbox:append-text-file', (event, payload) => folderFiles.appendText(event.sender, payload));
  ipcMain.handle('clip-sandbox:trash-files', (event, payload) => folderFiles.trash(event.sender, payload));

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

  new FrameReviewIpc({
    ipcMain,
    hostForEvent,
    chooseSourcePath: event => pickMovieFromDialog(BrowserWindow.fromWebContents(event.sender)),
  }).register();
  new ClipExtractionIpc({
    ipcMain,
    runtime: clipExtractionRuntime,
    hostForEvent,
  }).register();
  new ZoomEditSaveIpc({ ipcMain, saver: editedClipSaver }).register();
  new ZoomEditPreviewIpc({ ipcMain, previews: zoomEditPreviews }).register();
  new ClipCapturesIpc({
    ipcMain,
    store: clipCapturesStore,
    hostForEvent,
  }).register();
  return { dispose: async () => {
    await Promise.allSettled([
      clipExtractionRuntime.dispose(), editedClipSaver.dispose(), zoomEditPreviews.dispose(), clipCapturesStore.flush(),
    ]);
  } };
}

async function loadFrameReviewHostClass(projectFolder) {
  const hostModuleUrl = pathToFileURL(path.join(projectFolder, 'build', 'src', 'frame-review', 'host', 'frame-review-host.js')).href;
  const { FrameReviewHost } = await import(hostModuleUrl);
  return FrameReviewHost;
}

function frameReviewConfiguration(projectFolder, nativeProducts) {
  if (app.isPackaged) {
    const frameReviewFolder = path.join(process.resourcesPath, 'frame-review');
    const packagedManifest = nativeProducts.dependencyManifest();
    const packagedVersion = app.getVersion();
    return {
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
  }
  const dependencyManifest = nativeProducts.dependencyManifest();
  const dependencyRoot = path.join(projectFolder, 'tools', 'frame-review', '.deps');
  const ffmpegRoot = path.join(dependencyRoot, 'vcpkg-installed', 'x64-mingw-release');
  const libVlcRoot = path.join(dependencyRoot, 'libvlc');
  return {
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

app.whenReady().then(async () => {
  const projectFolder = path.resolve(__dirname, '..');
  const nativeProducts = new NativeProductLocator({
    projectFolder,
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
  });
  const frameReviewRuntime = new FrameReviewRuntime({
    hostClass: await loadFrameReviewHostClass(projectFolder),
    configuration: frameReviewConfiguration(projectFolder, nativeProducts),
  });
  const thumbnailRuntime = new ThumbnailCacheRuntime(app.getPath('userData'));
  await thumbnailRuntime.initialize();
  const { editComposition, fileNameValidity } = await loadSharedDomain(projectFolder);
  const clipExtractionRuntime = await registerIpc({
    frameReviewRuntime,
    thumbnailRuntime,
    nativeProducts,
    editComposition,
    fileNameValidity,
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
