const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { existsSync } = require('node:fs');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const spikeRoot = path.resolve(__dirname, '..');
const automaticSource = process.env.FRAME_CONTROL_AUTO_SOURCE;
const smokeOutput = process.env.FRAME_CONTROL_SMOKE_OUTPUT;
const soakOutput = process.env.FRAME_CONTROL_SOAK_OUTPUT;
let soakDiagnostics;
let window;
let hybrid;
let playback;
let preparation;
let proxyPreparation;
let session = emptySession();
let playbackFrameInFlight = null;
let pendingPlaybackFrame = null;
let shutdownPromise = null;
let shutdownComplete = false;

app.whenReady().then(start).catch((error) => {
  console.error(error?.stack ?? error);
  app.exit(1);
});

async function start() {
  await createServices();
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#171918',
    webPreferences: {
      preload: path.join(__dirname, 'control-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error') console.error(`[renderer] ${details.message}`);
  });
  playback.setFrameListener(onPlaybackFrame);
  registerHandlers();
  await window.loadFile(path.join(__dirname, 'control.html'));
  if (soakOutput) {
    const { runControlSoak } = require('./control-soak.cjs');
    void runControlSoak({
      window, app, output: soakOutput, spikeRoot, diagnostics: () => soakDiagnostics(),
      seconds: Number(process.env.FRAME_CONTROL_SOAK_SECONDS ?? 600),
      shutdown: shutdownServices,
    }).catch(async (error) => {
      console.error(error?.stack ?? error);
      await shutdownServices().catch(() => {});
      app.exit(1);
    });
  } else if (smokeOutput) void runSmoke().catch(failSmoke);
}

async function createServices() {
  const adapterRoot = path.join(spikeRoot, 'build', 'bridge-js', 'src', 'adapter');
  const { NativeProcessClient } = await import(pathToFileURL(path.join(adapterRoot, 'native-process-client.js')).href);
  const { BestSourceFramePlaybackAdapter } = await import(
    pathToFileURL(path.join(adapterRoot, 'bestsource-frame-playback-adapter.js')).href);
  const { LibVlcPlaybackAdapter } = await import(
    pathToFileURL(path.join(adapterRoot, 'libvlc-playback-adapter.js')).href);
  const { HybridFramePlaybackAdapter } = await import(
    pathToFileURL(path.join(adapterRoot, 'hybrid-frame-playback-adapter.js')).href);
  const { InteractivePreparationService } = await import(
    pathToFileURL(path.join(spikeRoot, 'src', 'preparation', 'interactive-preparation.mjs')).href);
  const { AllIntraProxyPreparationService, REVIEW_PROXY_PROFILE_GOP_1 } = await import(
    pathToFileURL(path.join(spikeRoot, 'src', 'preparation', 'all-intra-proxy-preparation.mjs')).href);
  const { createHardwareAwareReviewProxyEncoder } = await import(
    pathToFileURL(path.join(spikeRoot, 'src', 'preparation', 'proxy-acceleration-policy.mjs')).href);

  const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
  const bestSourceEnvironment = {
    ...process.env,
    PATH: [
      path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
      path.join(releaseRoot, 'bin'),
      path.join(releaseRoot, 'tools', 'ffmpeg'),
      'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
      process.env.PATH,
    ].join(';'),
  };
  const libvlcRoot = path.join(spikeRoot, '.deps', 'libvlc');
  const playbackClient = new NativeProcessClient({
    executable: path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_media_service.exe'),
    args: [path.join(libvlcRoot, 'libvlc.dll')],
    env: {
      ...process.env,
      PATH: `${libvlcRoot};${process.env.PATH}`,
      VLC_PLUGIN_PATH: path.join(libvlcRoot, 'plugins'),
    },
    operationTimeoutMs: 60_000,
  });
  const exactClient = new NativeProcessClient({
    executable: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_media_service.exe'),
    env: bestSourceEnvironment,
    operationTimeoutMs: 60_000,
  });
  playback = new LibVlcPlaybackAdapter(playbackClient);
  const exact = new BestSourceFramePlaybackAdapter(exactClient, {
    scrubDebounceMs: 0,
    scrubDelivery: 'progressive',
  });
  hybrid = new HybridFramePlaybackAdapter(playback, exact);
  soakDiagnostics = () => ({
    playback: playbackClient.diagnostics(), exact: exactClient.diagnostics(),
    progressiveQueueDepth: exact.progressiveQueueDepth,
    playbackInFlight: playbackFrameInFlight ? 1 : 0,
    playbackPending: pendingPlaybackFrame ? 1 : 0,
  });

  const manifest = JSON.parse(await readFile(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
  const preparationEvidence = await readOptionalJson(
    path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'), { results: [] });
  preparation = new InteractivePreparationService({
    cacheRoot: path.join(spikeRoot, '.deps', 'prepared-review-cache'),
    sampleSignature: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_sample_signature.exe'),
    packetScanner: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_packet_scan.exe'),
    bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
    ffmpeg: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe'),
    bestSourceVersion: manifest.dependencies.bestsource.version,
    ffmpegVersion: manifest.dependencies.ffmpeg.version,
    legacyPrepared: preparationEvidence.results,
    environment: bestSourceEnvironment,
  });
  const softwareFfmpeg = path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe');
  const acceleratedFfmpeg = path.join(
    spikeRoot, '.deps', 'phase3c-vcpkg-installed', 'x64-mingw-release', 'tools', 'ffmpeg', 'ffmpeg.exe');
  const encodingBackend = process.platform === 'win32' && existsSync(acceleratedFfmpeg)
    ? createHardwareAwareReviewProxyEncoder({
        softwareFfmpeg,
        acceleratedFfmpeg,
        ffprobe: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe'),
        environment: bestSourceEnvironment,
      })
    : undefined;
  proxyPreparation = new AllIntraProxyPreparationService({
    cacheRoot: path.join(spikeRoot, '.deps', 'prepared-review-cache', 'proxies'),
    bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
    ffmpeg: softwareFfmpeg,
    ffprobe: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe'),
    profile: REVIEW_PROXY_PROFILE_GOP_1,
    bestSourceVersion: manifest.dependencies.bestsource.version,
    ffmpegVersion: manifest.dependencies.ffmpeg.version,
    environment: bestSourceEnvironment,
    ...(encodingBackend ? { encodingBackend } : {}),
  });
}

function registerHandlers() {
  ipcMain.handle('frame-control:choose-source', async (_event, fields) => {
    const previewBounds = parsePreviewBounds(fields?.previewBounds);
    if (automaticSource) return openSelectedSource(path.resolve(automaticSource), previewBounds);
    const selected = await chooseMovie();
    if (!selected) return { cancelled: true };
    return openSelectedSource(selected, previewBounds);
  });

  ipcMain.handle('frame-control:play', async () => {
    requireSession();
    session.displayMode = 'playback';
    pendingPlaybackFrame = null;
    await hybrid.play();
    session.playing = true;
    return currentState();
  });
  ipcMain.handle('frame-control:prime-preview', async () => {
    requireSession();
    session.displayMode = 'playback';
    session.playing = false;
    await hybrid.primePreview();
    return { ...currentState(), playbackStatus: serializeStatus(await hybrid.playbackStatus()) };
  });
  ipcMain.handle('frame-control:pause', async () => {
    requireSession();
    await hybrid.pause();
    session.playing = false;
    return currentState();
  });
  ipcMain.handle('frame-control:pause-exact', async () => {
    requireExactReady();
    session.displayMode = 'exact';
    pendingPlaybackFrame = null;
    session.playing = false;
    return serializeFrame(await hybrid.enterExactAtCurrentPlaybackTime());
  });
  ipcMain.handle('frame-control:capture-current', async () => {
    requireExactReady();
    return serializeFrame(await hybrid.captureCurrentFrame(), false);
  });
  ipcMain.handle('frame-control:rate', async (_event, fields) => {
    requireSession();
    const rate = parseRate(fields?.rate);
    await hybrid.setRate(rate);
    return currentState();
  });
  ipcMain.handle('frame-control:scrub', async (_event, fields) => {
    requireSession();
    const ratio = parseRatio(fields?.ratio);
    if (session.exactReady) {
      session.playing = false;
      session.displayMode = 'exact';
      pendingPlaybackFrame = null;
      try {
        return { mode: 'exact', frame: serializeFrame(await hybrid.scrubToFrame(
          Math.round(ratio * Math.max(0, session.numFrames - 1)))) };
      } catch (error) {
        if (error?.category === 'stale-response') return { mode: 'exact', stale: true };
        throw error;
      }
    }
    const status = await hybrid.playbackStatus();
    const lengthUs = status.lengthUs ?? 0n;
    if (lengthUs <= 0n) throw new Error('Playback duration is not available yet. Start playback and try again.');
    await hybrid.seekPlaybackTimeUs(BigInt(Math.round(Number(lengthUs) * ratio)));
    return { mode: 'playback', status: serializeStatus(await hybrid.playbackStatus()) };
  });
  ipcMain.handle('frame-control:step', async (_event, fields) => {
    requireExactReady();
    const direction = fields?.direction;
    const count = fields?.count;
    if (![-1, 1].includes(direction) || !Number.isSafeInteger(count) || count < 1 || count > 1_000) {
      throw new Error('Invalid frame-step request.');
    }
    session.playing = false;
    session.displayMode = 'exact';
    pendingPlaybackFrame = null;
    return serializeFrame(await hybrid.stepFrames(direction, count));
  });
  ipcMain.handle('frame-control:status', async () => {
    if (!session.loaded) return currentState();
    try {
      return { ...currentState(), playbackStatus: serializeStatus(await hybrid.playbackStatus()) };
    } catch (error) {
      if (error?.category === 'stale-response') return currentState();
      throw error;
    }
  });
  ipcMain.handle('frame-control:close', async () => {
    await resetSession();
    return currentState();
  });
  ipcMain.on('frame-control:playback-ack', (_event, fields) => {
    const sourceGeneration = fields?.sourceGeneration;
    const frameGeneration = fields?.frameGeneration;
    if (!playbackFrameInFlight || !Number.isSafeInteger(sourceGeneration) ||
        !Number.isSafeInteger(frameGeneration) ||
        playbackFrameInFlight.sourceGeneration !== sourceGeneration ||
        playbackFrameInFlight.frameGeneration !== frameGeneration) return;
    playbackFrameInFlight = null;
    playback.acknowledgeFrame(frameGeneration).catch(reportBackgroundError);
    const next = pendingPlaybackFrame;
    pendingPlaybackFrame = null;
    if (next && session.displayMode === 'playback') sendPlaybackFrame(next);
  });
}

async function chooseMovie() {
  const selected = await dialog.showOpenDialog(window, {
    title: 'Open movie',
    properties: ['openFile'],
    filters: [
      { name: 'Video files', extensions: ['avi', 'flv', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'm2ts', 'webm', 'wmv'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return selected.canceled || selected.filePaths.length !== 1 ? null : path.resolve(selected.filePaths[0]);
}

async function openSelectedSource(sourcePath, previewBounds) {
  await resetSession();
  const generation = session.generation + 1;
  session = {
    ...emptySession(generation),
    loaded: true,
    sourcePath,
    sourceName: path.basename(sourcePath),
    previewBounds,
  };
  const playbackStatus = await hybrid.openPlaybackSource(sourcePath, previewBounds);
  void prepareExactReview(generation);
  return {
    cancelled: false,
    generation,
    sourceName: session.sourceName,
    playbackStatus: serializeStatus(playbackStatus),
  };
}

async function prepareExactReview(generation) {
  try {
    const canonical = await preparation.prepare(session.sourcePath, (event) => {
      if (generation === session.generation) send('frame-control:preparation', { generation, ...event });
    });
    if (generation !== session.generation) return;
    const proxy = await proxyPreparation.prepare(canonical, (event) => {
      if (generation === session.generation) send('frame-control:preparation', { generation, ...event });
    });
    if (generation !== session.generation) return;
    playbackFrameInFlight = null;
    pendingPlaybackFrame = null;
    const status = await hybrid.activatePreparedReview({
      playbackSourcePath: proxy.proxyAssetPath,
      fallbackPlaybackSourcePath: session.sourcePath,
      reviewAssetPath: proxy.proxyAssetPath,
      indexPath: proxy.proxyIndexPath,
      identitySource: {
        reviewAssetPath: proxy.identitySourcePath,
        indexPath: proxy.identityIndexPath,
      },
      previewBounds: session.previewBounds,
    });
    if (generation !== session.generation) return;
    session.exactReady = true;
    session.numFrames = status.numFrames ?? proxy.numFrames ?? 0;
    session.proxyPreparation = proxy.metrics;
    session.proxyProfile = proxy.profile;
    session.proxySelectedAudio = proxy.selectedAudio;
    session.playbackAssetKind = 'review-proxy';
    send('frame-control:preparation', {
      type: 'exact-ready',
      generation,
      numFrames: session.numFrames,
      cacheHit: proxy.cacheHit,
      reviewAssetKind: 'review-proxy',
      proxyProfile: proxy.profile,
      proxySelectedAudio: proxy.selectedAudio,
      proxyPreparation: proxy.metrics,
    });
  } catch (error) {
    if (generation !== session.generation || error?.name === 'AbortError') return;
    session.preparationError = friendlyError(error);
    send('frame-control:preparation', {
      type: 'preparation-failed',
      generation,
      message: session.preparationError,
    });
  }
}

function onPlaybackFrame(frame) {
  if (!session.loaded || session.displayMode !== 'playback') {
    playback.acknowledgeFrame(frame.frameGeneration).catch(reportBackgroundError);
    return;
  }
  if (playbackFrameInFlight) {
    pendingPlaybackFrame = frame;
    return;
  }
  sendPlaybackFrame(frame);
}

function sendPlaybackFrame(frame) {
  playbackFrameInFlight = {
    sourceGeneration: frame.sourceGeneration,
    frameGeneration: frame.frameGeneration,
  };
  send('frame-control:playback-frame', {
    sourceGeneration: frame.sourceGeneration,
    frameGeneration: frame.frameGeneration,
    playbackTimestampUs: frame.playbackTimestampUs.toString(),
    width: frame.width,
    height: frame.height,
    sourceWidth: frame.sourceWidth,
    sourceHeight: frame.sourceHeight,
    stride: frame.stride,
    pixelFormat: frame.pixelFormat,
    pixels: Buffer.from(frame.pixels),
    droppedBeforeWrite: frame.droppedBeforeWrite,
  });
}

async function resetSession() {
  preparation.cancel();
  proxyPreparation.cancel();
  playbackFrameInFlight = null;
  pendingPlaybackFrame = null;
  if (session.loaded) await hybrid.close();
  session = emptySession(session.generation + 1);
}

function serializeFrame(frame, includePixels = true) {
  return {
    identity: {
      ...frame.identity,
      pts: frame.identity.pts.toString(),
      duration: frame.identity.duration.toString(),
      timebaseNumerator: frame.identity.timebaseNumerator.toString(),
      timebaseDenominator: frame.identity.timebaseDenominator.toString(),
      frameInfoPts: frame.identity.frameInfoPts.toString(),
    },
    sourceGeneration: frame.sourceGeneration,
    frameGeneration: frame.frameGeneration,
    width: frame.width,
    height: frame.height,
    sourceWidth: frame.sourceWidth,
    sourceHeight: frame.sourceHeight,
    stride: frame.stride,
    pixelFormat: frame.pixelFormat,
    ...(includePixels ? { pixels: Buffer.from(frame.pixels) } : {}),
    timings: frame.timings,
  };
}

function serializeStatus(status) {
  return {
    ...status,
    ...(status.timeUs === undefined ? {} : { timeUs: status.timeUs.toString() }),
    ...(status.lengthUs === undefined ? {} : { lengthUs: status.lengthUs.toString() }),
  };
}

function currentState() {
  return {
    generation: session.generation,
    loaded: session.loaded,
    sourceName: session.sourceName,
    exactReady: session.exactReady,
    numFrames: session.numFrames,
    playing: session.playing,
    displayMode: session.displayMode,
    preparationError: session.preparationError,
    proxyPreparation: session.proxyPreparation,
    proxyProfile: session.proxyProfile,
    proxySelectedAudio: session.proxySelectedAudio,
    playbackAssetKind: session.playbackAssetKind,
  };
}

function emptySession(generation = 0) {
  return {
    generation,
    loaded: false,
    sourcePath: null,
    sourceName: null,
    previewBounds: null,
    exactReady: false,
    numFrames: 0,
    playing: false,
    displayMode: 'playback',
    preparationError: null,
    proxyPreparation: null,
    proxyProfile: null,
    proxySelectedAudio: null,
    playbackAssetKind: 'original-source',
  };
}

function requireSession() {
  if (!session.loaded) throw new Error('Open a movie first.');
}

function requireExactReady() {
  requireSession();
  if (!session.exactReady) throw new Error('Exact frame review is still being prepared.');
}

function parsePreviewBounds(value) {
  const maxWidth = value?.maxWidth;
  const maxHeight = value?.maxHeight;
  if (!Number.isSafeInteger(maxWidth) || maxWidth < 1 || maxWidth > 16_384 ||
      !Number.isSafeInteger(maxHeight) || maxHeight < 1 || maxHeight > 16_384 ||
      maxWidth * maxHeight * 4 > 256 * 1024 * 1024) {
    throw new Error('Invalid preview bounds.');
  }
  return { maxWidth, maxHeight };
}

function parseRate(value) {
  if (![0.25, 0.5, 1, 2].includes(value)) throw new Error('Invalid playback rate.');
  return value;
}

function parseRatio(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Invalid scrub position.');
  }
  return value;
}

function send(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function friendlyError(error) {
  return String(error?.message ?? error).split(/\r?\n/, 1)[0].slice(0, 500);
}

async function readOptionalJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function reportBackgroundError(error) {
  console.error(error?.stack ?? error);
}

function shutdownServices() {
  if (!shutdownPromise) {
    shutdownPromise = hybrid.shutdown()
      .finally(() => { shutdownComplete = true; });
  }
  return shutdownPromise;
}

async function runSmoke() {
  if (!automaticSource) throw new Error('FRAME_CONTROL_AUTO_SOURCE is required for smoke mode.');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const evidence = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (predicate, label, timeoutMs = 30000) => {
      const started = performance.now();
      while (!(await predicate())) {
        if (performance.now() - started > timeoutMs) {
          let sessionState = null;
          try { sessionState = await window.frameIdentityControl.status(); } catch (error) {
            sessionState = { statusError: String(error?.message ?? error) };
          }
          throw new Error('Timed out waiting for ' + label + ': ' + JSON.stringify({
            busy: !document.getElementById('busy-state').hidden,
            playTitle: document.getElementById('play-pause').title,
            playDisabled: document.getElementById('play-pause').disabled,
            frameIdentity: document.getElementById('frame-identity').textContent,
            playerError: document.getElementById('player-error').textContent,
            sessionState,
          }));
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    const key = (type, value) => window.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true }));
    const frameNumber = () => Number(document.getElementById('frame-identity').textContent.replace(/[^0-9]/g, ''));
    document.getElementById('open-movie').click();
    await waitFor(() => !document.getElementById('play-pause').disabled, 'movie open');
    await waitFor(() => document.getElementById('video-canvas').classList.contains('visible'),
      'opening first-frame preview');
    if (document.getElementById('play-pause').title !== 'Play') throw new Error('Opening preview was not paused.');
    if (document.getElementById('stop')) throw new Error('A separate stop control is still present.');
    await waitFor(() => !document.querySelector('.exact-control').disabled ||
      document.getElementById('player-error').textContent, 'exact review', 1800000);
    if (document.getElementById('player-error').textContent) throw new Error(document.getElementById('player-error').textContent);

    const firstGeneration = (await window.frameIdentityControl.status()).generation;
    document.getElementById('open-movie').click();
    await waitFor(async () => (await window.frameIdentityControl.status()).generation !== firstGeneration,
      'source reload');
    await waitFor(() => document.getElementById('video-canvas').classList.contains('visible') &&
      document.getElementById('busy-state').hidden, 'reloaded first-frame preview');
    await waitFor(async () => (await window.frameIdentityControl.status()).exactReady ||
      document.getElementById('player-error').textContent, 'reloaded exact review', 1800000);
    if (document.getElementById('player-error').textContent) throw new Error(document.getElementById('player-error').textContent);
    if (document.getElementById('seeker-preview') || document.getElementById('seeker-preview-canvas')) {
      throw new Error('Removed seeker thumbnail UI is still present.');
    }

    const timeline = document.getElementById('timeline');
    const mainCanvas = document.getElementById('video-canvas');
    const canvasChecksum = (canvas) => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let checksum = 0;
      for (let index = 0; index < pixels.length; index += 64) checksum = (checksum + pixels[index]) % 1000000007;
      return checksum;
    };
    const preparationState = await window.frameIdentityControl.status();
    const mainBeforeScrub = canvasChecksum(mainCanvas);
    const requestedAtByFrame = new Map();
    const displayed = [];
    const observer = new MutationObserver(() => {
      if (!document.getElementById('frame-identity').textContent.startsWith('Frame ')) return;
      const frame = frameNumber();
      if (!Number.isSafeInteger(frame) || displayed.some((sample) => sample.frame === frame)) return;
      displayed.push({ frame, at: performance.now(), latencyMs: performance.now() - (requestedAtByFrame.get(frame) ?? performance.now()) });
    });
    observer.observe(document.getElementById('frame-identity'), { childList: true, characterData: true, subtree: true });
    const dragStartedAt = performance.now();
    for (let step = 0; step < 12; ++step) {
      const ratio = 0.12 + step * 0.035;
      const value = Math.round(ratio * 100000);
      const targetFrame = Math.round(ratio * Math.max(0, preparationState.numFrames - 1));
      requestedAtByFrame.set(targetFrame, performance.now());
      timeline.value = String(value);
      timeline.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const selectedTimelineValue = timeline.value;
    await waitFor(() => document.getElementById('scrub-state').hidden,
      'full-player proxy scrub settlement', 60000);
    observer.disconnect();
    const dragFinishedAt = performance.now();
    const stateDuringPreview = await window.frameIdentityControl.status();
    if (stateDuringPreview.playing || stateDuringPreview.displayMode !== 'exact') {
      throw new Error('Full-player proxy scrubbing did not own the exact display.');
    }
    if (displayed.length < 2) throw new Error('Full-player proxy scrubbing displayed fewer than two frames.');
    if (timeline.value !== selectedTimelineValue) throw new Error('Timeline selection snapped back before commit.');
    timeline.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => document.getElementById('busy-state').hidden &&
      document.getElementById('play-pause').title === 'Pause', 'seek and automatic playback', 65000);
    const sortedLatencies = displayed.map((sample) => sample.latencyMs).sort((left, right) => left - right);
    const fullPlayerScrub = {
      requestedPositions: 12,
      displayedFrames: displayed.length,
      displayedFrameIndexes: displayed.map((sample) => sample.frame),
      dragDurationMs: dragFinishedAt - dragStartedAt,
      displayedFps: displayed.length / Math.max(0.001, (dragFinishedAt - dragStartedAt) / 1000),
      firstFrameMs: displayed[0].at - dragStartedAt,
      latencyP50Ms: sortedLatencies[Math.floor((sortedLatencies.length - 1) * 0.50)],
      latencyP95Ms: sortedLatencies[Math.floor((sortedLatencies.length - 1) * 0.95)],
      fullPlayerUpdated: canvasChecksum(mainCanvas) !== mainBeforeScrub,
    };
    await new Promise((resolve) => setTimeout(resolve, 250));
    timeline.value = '30000';
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    const playingTimelineValue = timeline.value;
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (timeline.value !== playingTimelineValue) throw new Error('Playback frames moved the dragged timeline position.');
    timeline.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => document.getElementById('busy-state').hidden &&
      document.getElementById('play-pause').title === 'Pause', 'playback scrub recommit', 65000);
    key('keydown', 'q'); key('keyup', 'q');
    await waitFor(() => document.getElementById('draft-start').textContent.includes('Frame') ||
      document.getElementById('player-error').textContent, 'playback range capture', 60000);
    if (document.getElementById('player-error').textContent) throw new Error(document.getElementById('player-error').textContent);

    key('keydown', ' '); key('keyup', ' ');
    await waitFor(() => document.getElementById('frame-identity').textContent.startsWith('Frame') ||
      document.getElementById('player-error').textContent, 'space pause');
    if (document.getElementById('player-error').textContent) throw new Error(document.getElementById('player-error').textContent);
    const pausedFrame = frameNumber();
    key('keydown', 'ArrowRight'); key('keyup', 'ArrowRight');
    await waitFor(() => frameNumber() !== pausedFrame, 'single-frame step');
    const singleStepAdvance = frameNumber() - pausedFrame;
    if (singleStepAdvance !== 1) throw new Error('Single arrow tap advanced ' + singleStepAdvance + ' frames.');
    const heldStart = frameNumber();
    key('keydown', 'ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 450));
    key('keyup', 'ArrowRight');
    await waitFor(() => frameNumber() >= heldStart + 3, 'held frame stepping');
    const heldAdvance = frameNumber() - heldStart;
    if (heldAdvance !== 3) throw new Error('Held stepping advanced ' + heldAdvance + ' frames in 450 ms.');

    timeline.value = '50000';
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    timeline.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => document.getElementById('busy-state').hidden &&
      document.getElementById('play-pause').title === 'Pause' ||
      document.getElementById('player-error').textContent, 'midpoint scrub completion', 65000);
    if (document.getElementById('player-error').textContent) throw new Error(document.getElementById('player-error').textContent);
    key('keydown', ' '); key('keyup', ' ');
    await waitFor(() => document.getElementById('play-pause').title === 'Play', 'pause after midpoint scrub');

    if (document.querySelector('[data-step="10"]')) throw new Error('The removed +10 control is still present.');
    key('keydown', 'q'); key('keyup', 'q');
    document.getElementById('step-forward').click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    key('keydown', 'w'); key('keyup', 'w');
    await waitFor(() => document.getElementById('draft-end').textContent.includes('Frame'), 'end mark');
    key('keydown', 'a'); key('keyup', 'a');
    await waitFor(() => document.getElementById('draft-state').textContent === 'Locked', 'range lock');
    document.getElementById('step-forward').click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    key('keydown', 'q'); key('keyup', 'q');
    await waitFor(() => document.querySelectorAll('#ranges-list li').length === 1, 'captured range');

    timeline.value = '50000';
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    timeline.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => document.getElementById('busy-state').hidden &&
      document.getElementById('play-pause').title === 'Pause', 'scrub completion', 65000);
    const rate = document.getElementById('playback-rate');
    rate.value = '0.5'; rate.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    rate.value = '2'; rate.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    rate.value = '1'; rate.dispatchEvent(new Event('change', { bubbles: true }));
    key('keydown', ' '); key('keyup', ' ');
    await waitFor(() => document.getElementById('frame-identity').textContent.startsWith('Frame'), 'resume handoff');
    document.getElementById('play-pause').click();
    await waitFor(() => document.getElementById('play-pause').title === 'Pause', 'button resume');
    await new Promise((resolve) => setTimeout(resolve, 300));
    key('keydown', ' '); key('keyup', ' ');
    await waitFor(() => document.getElementById('frame-identity').textContent.startsWith('Frame'), 'final space pause');

    const canvas = document.getElementById('video-canvas');
    const finalStatus = await window.frameIdentityControl.status();
    return {
      sourceName: document.getElementById('source-name').textContent,
      readiness: document.getElementById('readiness').textContent,
      frameIdentity: document.getElementById('frame-identity').textContent,
      capturedRangeCount: document.querySelectorAll('#ranges-list li').length,
      draftState: document.getElementById('draft-state').textContent,
      heldAdvance,
      singleStepAdvance,
      fullPlayerScrub,
      proxyPreparation: finalStatus.proxyPreparation,
      proxyProfile: finalStatus.proxyProfile,
      proxySelectedAudio: finalStatus.proxySelectedAudio,
      playbackAssetKind: finalStatus.playbackAssetKind,
      canvas: { width: canvas.width, height: canvas.height, visible: canvas.classList.contains('visible') },
      playerError: document.getElementById('player-error').textContent,
    };
  })()`);
  const screenshotPath = smokeOutput.replace(/\.json$/i, '.png');
  const screenshot = await window.webContents.capturePage();
  await writeFile(screenshotPath, screenshot.toPNG());
  await writeFile(smokeOutput, `${JSON.stringify({ ...evidence, screenshotPath }, null, 2)}\n`, 'utf8');
  await shutdownServices();
  app.quit();
}

async function failSmoke(error) {
  const evidence = { error: friendlyError(error), stack: String(error?.stack ?? error) };
  await writeFile(smokeOutput, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8').catch(reportBackgroundError);
  await shutdownServices().catch(reportBackgroundError);
  app.exit(1);
}

app.on('before-quit', (event) => {
  preparation?.cancel();
  proxyPreparation?.cancel();
  if (hybrid && !shutdownComplete) {
    event.preventDefault();
    void shutdownServices().catch(reportBackgroundError).finally(() => app.quit());
  }
});
app.on('window-all-closed', () => app.quit());
