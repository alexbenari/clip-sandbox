const { app, BrowserWindow, ipcMain } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const spikeRoot = path.resolve(__dirname, '..');
const targetId = process.env.FRAME_BRIDGE_TARGET_ID;
const outputPath = process.env.FRAME_BRIDGE_OUTPUT_PATH;
const transportMode = process.env.FRAME_BRIDGE_TRANSPORT_MODE ?? 'binary';
const previewMode = process.env.FRAME_BRIDGE_PREVIEW_MODE ?? 'source';
const scrubDebounceMs = Number(process.env.FRAME_BRIDGE_SCRUB_DEBOUNCE_MS ?? 0);
if (!targetId || !outputPath) throw new Error('FRAME_BRIDGE_TARGET_ID and FRAME_BRIDGE_OUTPUT_PATH are required.');
if (!['binary', 'shared-ring'].includes(transportMode)) throw new Error(`Unsupported transport mode: ${transportMode}`);
if (!['source', 'viewport'].includes(previewMode)) throw new Error(`Unsupported preview mode: ${previewMode}`);
if (!Number.isSafeInteger(scrubDebounceMs) || scrubDebounceMs < 0 || scrubDebounceMs > 1_000) {
  throw new Error('FRAME_BRIDGE_SCRUB_DEBOUNCE_MS must be an integer between 0 and 1000.');
}

let window;
let hybrid;
let playback;
let target;
let playbackFrameInFlight = false;
let pendingPlaybackFrame = null;
let playbackMainDrops = 0;
let sharedRing = null;

app.whenReady().then(start).catch(async (error) => {
  await writeFile(outputPath, `${JSON.stringify({ targetId, error: String(error?.stack ?? error) }, null, 2)}\n`, 'utf8');
  app.exit(1);
});

async function start() {
  const raw = JSON.parse(await readFile(path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'), 'utf8'));
  target = raw.results.find((result) => result.id === targetId && result.status === 'complete');
  if (!target) throw new Error(`Prepared benchmark target is unavailable: ${targetId}`);

  const adapterRoot = path.join(spikeRoot, 'build', 'bridge-js', 'src', 'adapter');
  const { NativeProcessClient } = await import(pathToFileURL(path.join(adapterRoot, 'native-process-client.js')).href);
  const { BestSourceFramePlaybackAdapter } = await import(pathToFileURL(path.join(adapterRoot, 'bestsource-frame-playback-adapter.js')).href);
  const { LibVlcPlaybackAdapter } = await import(pathToFileURL(path.join(adapterRoot, 'libvlc-playback-adapter.js')).href);
  const { HybridFramePlaybackAdapter } = await import(pathToFileURL(path.join(adapterRoot, 'hybrid-frame-playback-adapter.js')).href);

  const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
  const bestSourceEnvironment = {
    ...process.env,
    PATH: [
      path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
      path.join(releaseRoot, 'bin'),
      'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
      process.env.PATH,
    ].join(';'),
  };
  const libvlcRoot = path.join(spikeRoot, '.deps', 'libvlc');
  const playbackClient = new NativeProcessClient({
    executable: path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_media_service.exe'),
    args: [path.join(libvlcRoot, 'libvlc.dll')],
    env: { ...process.env, PATH: `${libvlcRoot};${process.env.PATH}`, VLC_PLUGIN_PATH: path.join(libvlcRoot, 'plugins') },
    operationTimeoutMs: 60_000,
  });
  const exactClient = new NativeProcessClient({
    executable: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_media_service.exe'),
    env: bestSourceEnvironment,
    operationTimeoutMs: 60_000,
  });
  playback = new LibVlcPlaybackAdapter(playbackClient);
  const exact = new BestSourceFramePlaybackAdapter(exactClient, { scrubDebounceMs });
  hybrid = new HybridFramePlaybackAdapter(playback, exact);

  window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.on('console-message', (event) => {
    console.error(`[renderer] ${event.message}`);
  });
  playback.setFrameListener((frame) => {
    if (!window || window.isDestroyed()) return;
    if (playbackFrameInFlight) {
      pendingPlaybackFrame = frame;
      ++playbackMainDrops;
      return;
    }
    sendPlaybackFrame(frame);
  });
  ipcMain.on('frame-bridge:playback-ack', (_event, frameGeneration) => {
    if (!playbackFrameInFlight || !Number.isSafeInteger(frameGeneration)) return;
    playbackFrameInFlight = false;
    const next = pendingPlaybackFrame;
    pendingPlaybackFrame = null;
    if (next) sendPlaybackFrame(next);
    playback.acknowledgeFrame(frameGeneration).catch((error) => {
      console.error(`[main] playback acknowledgement failed: ${error?.stack ?? error}`);
    });
  });
  registerHandlers();
  await window.loadFile(path.join(__dirname, 'benchmark.html'));
}

function sendPlaybackFrame(frame) {
  if (!window || window.isDestroyed()) return;
  playbackFrameInFlight = true;
  const serializationStarted = performance.now();
  const pixelStorage = storePixels(frame.pixels);
  const mainSerializationMs = performance.now() - serializationStarted;
  window.webContents.send('frame-bridge:playback-frame', {
      sourceGeneration: frame.sourceGeneration,
      frameGeneration: frame.frameGeneration,
      playbackTimestampUs: frame.playbackTimestampUs.toString(),
      width: frame.width,
      height: frame.height,
      sourceWidth: frame.sourceWidth,
      sourceHeight: frame.sourceHeight,
      stride: frame.stride,
      pixelFormat: frame.pixelFormat,
      ...pixelStorage,
      droppedBeforeWrite: frame.droppedBeforeWrite,
      droppedInMain: playbackMainDrops,
      mainSerializationMs,
      mainReadyAtEpochMs: performance.timeOrigin + performance.now(),
  });
}

function registerHandlers() {
  ipcMain.handle('frame-bridge:configuration', () => ({ transportMode, previewMode, scrubDebounceMs }));
  ipcMain.handle('frame-bridge:configure-shared-ring', (_event, config) => {
    if (transportMode !== 'shared-ring') throw new Error('Shared ring is disabled for this benchmark.');
    const { slotCount, slotBytes } = config ?? {};
    if (!Number.isSafeInteger(slotCount) || slotCount < 2 || slotCount > 8 ||
        !Number.isSafeInteger(slotBytes) || slotBytes < 1024 || slotBytes > 64 * 1024 * 1024) {
      throw new Error('Invalid shared frame-ring configuration.');
    }
    const controlBytes = slotCount * Int32Array.BYTES_PER_ELEMENT;
    const buffer = new SharedArrayBuffer(controlBytes + slotCount * slotBytes);
    sharedRing = {
      buffer,
      slotCount,
      slotBytes,
      controlBytes,
      states: new Int32Array(buffer, 0, slotCount),
    };
    return { buffer, slotCount, slotBytes, controlBytes };
  });
  ipcMain.handle('frame-bridge:open', async (_event, fields) => {
    const previewBounds = previewMode === 'viewport' ? parsePreviewBounds(fields?.previewBounds) : undefined;
    return hybrid.open({
      playbackSourcePath: target.sourcePath,
      reviewAssetPath: target.reviewAsset,
      indexPath: target.index,
      previewBounds,
    });
  });
  for (const command of ['exact', 'scrub', 'step']) {
    ipcMain.handle(`frame-bridge:${command}`, async (_event, fields) => {
      const started = performance.now();
      let frame;
      try {
        frame = command === 'step'
          ? await hybrid.stepAdjacent(fields.direction)
          : command === 'scrub'
            ? await hybrid.scrubToFrame(fields.frameIndex)
            : await hybrid.getExactFrame(fields.frameIndex);
      } catch (error) {
        if (command === 'scrub' && error?.category === 'stale-response') {
          return { stale: true, category: error.category };
        }
        throw error;
      }
      const serializationStarted = performance.now();
      const pixelStorage = storePixels(frame.pixels);
      const mainSerializationMs = performance.now() - serializationStarted;
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
        ...pixelStorage,
        timings: frame.timings,
        mainHandlingMs: performance.now() - started,
        mainSerializationMs,
        mainReadyAtEpochMs: performance.timeOrigin + performance.now(),
      };
    });
  }
  for (const command of ['play', 'pause', 'stop', 'status']) {
    ipcMain.handle(`frame-bridge:${command}`, async () => {
      console.error(`[main] ${command} started`);
      const result = await hybrid[command]();
      console.error(`[main] ${command} completed`);
      return result;
    });
  }
  ipcMain.handle('frame-bridge:rate', (_event, fields) => hybrid.setRate(fields.rate));
  ipcMain.handle('frame-bridge:complete', async (_event, result) => {
    const evidence = {
      targetId,
      sourceName: target.sourceName,
      transportMode,
      previewMode,
      scrubDebounceMs,
      generatedAtUtc: new Date().toISOString(),
      ...result,
    };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await hybrid.shutdown();
    setImmediate(() => app.quit());
    return { written: true };
  });
}

function parsePreviewBounds(value) {
  const maxWidth = value?.maxWidth;
  const maxHeight = value?.maxHeight;
  if (!Number.isSafeInteger(maxWidth) || maxWidth < 1 || maxWidth > 16_384 ||
      !Number.isSafeInteger(maxHeight) || maxHeight < 1 || maxHeight > 16_384) {
    throw new Error('Invalid preview bounds.');
  }
  if (maxWidth * maxHeight * 4 > 256 * 1024 * 1024) {
    throw new Error('Preview bounds exceed the native bridge payload limit.');
  }
  return { maxWidth, maxHeight };
}

function storePixels(pixels) {
  if (transportMode === 'binary') {
    return { pixels: Buffer.from(pixels), payloadBytes: pixels.byteLength };
  }
  if (!sharedRing) throw new Error('Shared frame ring has not been configured.');
  if (pixels.byteLength > sharedRing.slotBytes) {
    throw new Error(`Frame payload ${pixels.byteLength} exceeds shared slot size ${sharedRing.slotBytes}.`);
  }
  let slotIndex = -1;
  for (let index = 0; index < sharedRing.slotCount; ++index) {
    if (Atomics.compareExchange(sharedRing.states, index, 0, 1) === 0) {
      slotIndex = index;
      break;
    }
  }
  if (slotIndex < 0) throw new Error('Shared frame ring has no free slot.');
  const offset = sharedRing.controlBytes + slotIndex * sharedRing.slotBytes;
  new Uint8Array(sharedRing.buffer, offset, pixels.byteLength).set(pixels);
  Atomics.store(sharedRing.states, slotIndex, 2);
  Atomics.notify(sharedRing.states, slotIndex);
  return { sharedSlot: slotIndex, payloadBytes: pixels.byteLength };
}

app.on('window-all-closed', () => app.quit());
