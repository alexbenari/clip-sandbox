const canvas = document.querySelector('#viewport');
const context = canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: true });
const status = document.querySelector('#status');
let transportMode = 'binary';
let previewMode = 'source';
let scrubDebounceMs = 0;
let sharedRing = null;

run().catch(async (error) => {
  status.textContent = String(error?.stack ?? error);
  await window.frameBridgeBenchmark.complete({ error: String(error?.stack ?? error) });
});

async function run() {
  ({ transportMode, previewMode, scrubDebounceMs } = await window.frameBridgeBenchmark.invoke('configuration'));
  if (transportMode === 'shared-ring') {
    sharedRing = await window.frameBridgeBenchmark.createSharedRing(2, 64 * 1024 * 1024);
  }
  const previewBounds = {
    maxWidth: Math.max(1, Math.floor(document.documentElement.clientWidth)),
    maxHeight: Math.max(1, Math.floor(document.documentElement.clientHeight)),
  };
  const opened = await window.frameBridgeBenchmark.invoke('open', { previewBounds });
  const numFrames = opened.numFrames;
  status.textContent = 'Warming frame transport';
  await requestAndDraw('exact', { frameIndex: 0 });
  const exactFrames = [...new Set([
    Math.floor(numFrames / 10),
    Math.floor(numFrames / 4),
    Math.floor(numFrames / 2),
    Math.floor(numFrames * 3 / 4),
    Math.floor(numFrames * 9 / 10),
  ])];
  const exact = [];
  for (const frameIndex of exactFrames) {
    status.textContent = `Exact frame ${frameIndex}`;
    exact.push(await requestAndDraw('exact', { frameIndex }));
  }
  console.log('exact complete');

  const scrubStart = Math.max(0, Math.floor(numFrames / 2) - 10);
  const scrubStartedAtEpochMs = performance.timeOrigin + performance.now();
  const scrubRequests = Array.from({ length: 20 }, (_, index) =>
    window.frameBridgeBenchmark.invoke('scrub', { frameIndex: scrubStart + index }));
  const scrubSettled = await Promise.allSettled(scrubRequests);
  const scrubSuccesses = scrubSettled.filter((result) => result.status === 'fulfilled' && !result.value.stale);
  const scrubStale = scrubSettled.filter((result) => result.status === 'fulfilled' && result.value.stale);
  const scrubLatest = scrubSuccesses.at(-1)?.value;
  if (!scrubLatest || scrubLatest.identity.frameIndex !== scrubStart + 19) {
    throw new Error('Latest-wins scrub did not deliver the newest requested frame.');
  }
  const scrubDraw = await drawFrame(scrubLatest);
  console.log('scrub complete');

  const stepStart = Math.min(Math.max(0, Math.floor(numFrames / 2)), Math.max(0, numFrames - 31));
  await requestAndDraw('exact', { frameIndex: stepStart });
  const adjacent = [];
  for (let index = 0; index < 30 && stepStart + index + 1 < numFrames; ++index) {
    adjacent.push(await requestAndDraw('step', { direction: 1 }));
  }
  console.log('adjacent complete');

  const playback = await playbackFrames(30);
  const result = {
    numFrames,
    preview: { mode: previewMode, bounds: previewBounds, scrubDebounceMs },
    exact,
    scrub: {
      requested: scrubRequests.length,
      fulfilled: scrubSuccesses.length,
      stale: scrubStale.length,
      rejected: scrubSettled.filter((result) => result.status === 'rejected').length,
      latestFrameIndex: scrubLatest.identity.frameIndex,
      settlementMs: performance.timeOrigin + performance.now() - scrubStartedAtEpochMs,
      draw: scrubDraw,
    },
    adjacent,
    playback,
    canvas: { width: canvas.width, height: canvas.height },
  };
  status.textContent = 'Bridge benchmark complete';
  await window.frameBridgeBenchmark.complete(result);
}

async function requestAndDraw(command, fields) {
  const rendererStartedAtEpochMs = performance.timeOrigin + performance.now();
  const frame = await window.frameBridgeBenchmark.invoke(command, fields);
  const rendererReceivedAtEpochMs = performance.timeOrigin + performance.now();
  const draw = await drawFrame(frame);
  return {
    frameIndex: frame.identity.frameIndex,
    width: frame.width,
    height: frame.height,
    sourceWidth: frame.sourceWidth,
    sourceHeight: frame.sourceHeight,
    payloadBytes: frame.payloadBytes ?? frame.pixels.byteLength,
    timings: {
      ...frame.timings,
      mainHandlingMs: frame.mainHandlingMs,
      mainSerializationMs: frame.mainSerializationMs,
      mainToRendererMs: Math.max(0, rendererReceivedAtEpochMs - frame.mainReadyAtEpochMs),
      rendererInvokeToReceiveMs: rendererReceivedAtEpochMs - rendererStartedAtEpochMs,
      uploadDrawMs: draw.uploadDrawMs,
      endToEndMs: draw.visibleAtEpochMs - rendererStartedAtEpochMs,
    },
    pixelCheck: draw.pixelCheck,
  };
}

async function drawFrame(frame) {
  canvas.width = frame.width;
  canvas.height = frame.height;
  const acquired = acquirePixels(frame);
  const source = acquired.pixels;
  let packed = source;
  if (frame.stride !== frame.width * 4) {
    packed = new Uint8Array(frame.width * frame.height * 4);
    for (let row = 0; row < frame.height; ++row) {
      packed.set(source.subarray(row * frame.stride, row * frame.stride + frame.width * 4), row * frame.width * 4);
    }
  }
  try {
    const started = performance.now();
    context.putImageData(new ImageData(new Uint8ClampedArray(packed.buffer, packed.byteOffset, packed.byteLength),
      frame.width, frame.height), 0, 0);
    await new Promise(requestAnimationFrame);
    const uploadDrawMs = performance.now() - started;
    const visibleAtEpochMs = performance.timeOrigin + performance.now();
    const samplePoints = [
      [0, 0],
      [Math.floor((frame.width - 1) / 2), Math.floor((frame.height - 1) / 2)],
      [frame.width - 1, frame.height - 1],
      [Math.floor((frame.width - 1) * 3 / 4), Math.floor((frame.height - 1) / 4)],
    ];
    let matches = 0;
    for (const [x, y] of samplePoints) {
      const sourceOffset = y * frame.width * 4 + x * 4;
      const rendered = context.getImageData(x, y, 1, 1).data;
      if (rendered[0] === packed[sourceOffset] && rendered[1] === packed[sourceOffset + 1] &&
          rendered[2] === packed[sourceOffset + 2] && rendered[3] === packed[sourceOffset + 3]) {
        ++matches;
      }
    }
    if (matches !== samplePoints.length) throw new Error('Rendered canvas pixels do not match the delivered frame.');
    return {
      uploadDrawMs,
      visibleAtEpochMs,
      pixelCheck: { sampledPixels: samplePoints.length, sampledMatchingPixels: matches },
    };
  } finally {
    acquired.release();
  }
}

function acquirePixels(frame) {
  if (frame.sharedSlot === undefined) {
    return {
      pixels: frame.pixels instanceof Uint8Array ? frame.pixels : new Uint8Array(frame.pixels),
      release() {},
    };
  }
  if (!sharedRing || !Number.isSafeInteger(frame.sharedSlot) || frame.sharedSlot < 0 ||
      frame.sharedSlot >= sharedRing.slotCount || !Number.isSafeInteger(frame.payloadBytes) ||
      frame.payloadBytes < 0 || frame.payloadBytes > sharedRing.slotBytes) {
    throw new Error('Invalid shared frame descriptor.');
  }
  const states = new Int32Array(sharedRing.buffer, 0, sharedRing.slotCount);
  if (Atomics.compareExchange(states, frame.sharedSlot, 2, 3) !== 2) {
    throw new Error('Shared frame slot is not ready for reading.');
  }
  const offset = sharedRing.controlBytes + frame.sharedSlot * sharedRing.slotBytes;
  return {
    pixels: new Uint8Array(sharedRing.buffer, offset, frame.payloadBytes),
    release() {
      Atomics.store(states, frame.sharedSlot, 0);
      Atomics.notify(states, frame.sharedSlot);
    },
  };
}

async function playbackFrames(count) {
  const frames = [];
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const timeout = setTimeout(() => rejectDone(new Error('Timed out collecting playback frames.')), 20_000);
  const startedAtEpochMs = performance.timeOrigin + performance.now();
  const unsubscribe = window.frameBridgeBenchmark.onPlaybackFrame(async (frame) => {
    try {
      if (frames.length >= count) return;
      const receivedAtEpochMs = performance.timeOrigin + performance.now();
      const draw = await drawFrame(frame);
      frames.push({
        frameGeneration: frame.frameGeneration,
        playbackTimestampUs: frame.playbackTimestampUs,
        width: frame.width,
        height: frame.height,
        sourceWidth: frame.sourceWidth,
        sourceHeight: frame.sourceHeight,
        payloadBytes: frame.payloadBytes ?? frame.pixels.byteLength,
        droppedBeforeWrite: frame.droppedBeforeWrite,
        droppedInMain: frame.droppedInMain,
        mainToRendererMs: Math.max(0, receivedAtEpochMs - frame.mainReadyAtEpochMs),
        uploadDrawMs: draw.uploadDrawMs,
        pixelCheck: draw.pixelCheck,
      });
      if (frames.length % 5 === 0) console.log(`playback frames ${frames.length}/${count}`);
      if (frames.length === count) resolveDone();
    } finally {
      window.frameBridgeBenchmark.acknowledgePlaybackFrame(frame.frameGeneration);
    }
  });
  try {
    console.log('playback play requested');
    await window.frameBridgeBenchmark.invoke('play');
    console.log('playback play completed');
    await done;
    console.log('playback collection completed');
    await window.frameBridgeBenchmark.invoke('pause');
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
  const elapsedMs = performance.timeOrigin + performance.now() - startedAtEpochMs;
  return { frames, elapsedMs, visibleFps: frames.length * 1000 / elapsedMs };
}
