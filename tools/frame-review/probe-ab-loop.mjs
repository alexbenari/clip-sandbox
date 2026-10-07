import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const project = path.resolve('.');
const cycles = Number(process.argv.find(arg => arg.startsWith('--cycles='))?.split('=')[1] ?? 3);
if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 100) throw new Error('Cycle count must be 1–100.');
const fixtureKind = process.argv.find(arg => arg.startsWith('--fixture='))?.split('=')[1] ?? 'cfr';
if (!['cfr', 'vfr', 'offset', 'normalize'].includes(fixtureKind)) throw new Error('Fixture must be cfr, vfr, offset, or normalize.');
const load = process.argv.find(arg => arg.startsWith('--load='))?.split('=')[1] ?? 'normal';
if (!['normal', 'artificial'].includes(load)) throw new Error('Load must be normal or artificial.');
const pauseAt = Number(process.argv.find(arg => arg.startsWith('--pause-at='))?.split('=')[1] ?? 60);
if (!Number.isSafeInteger(pauseAt) || pauseAt < 24 || pauseAt > 96) throw new Error('Pause ordinal must be 24–96.');
const dependencies = JSON.parse(await readFile(path.join(project, 'tools/frame-review/.deps/resolved-dependencies.json'), 'utf8'));
const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-ab-probe-'));
const movie = path.join(root, `coded-${fixtureKind}.${fixtureKind === 'normalize' ? 'avi' : 'mkv'}`);
const intermediateMovie = fixtureKind === 'normalize' ? path.join(root, 'coded-intermediate.mkv') : movie;
const raw = path.join(root, `coded-${fixtureKind}.rgb`);
const profile = path.join(root, 'profile');
const frameCount = 144;
const width = 320;
const height = 180;
const frameBytes = width * height * 3;
const bytes = Buffer.alloc(frameCount * frameBytes);
for (let ordinal = 0; ordinal < frameCount; ordinal += 1) {
  const start = ordinal * frameBytes;
  bytes.fill(100, start, start + frameBytes);
  for (let bit = 0; bit < 10; bit += 1) {
    const color = (ordinal & (1 << bit)) ? 235 : 16;
    for (let y = 30; y < 90; y += 1) {
      for (let x = bit * 30 + 5; x < bit * 30 + 25; x += 1) {
        const offset = start + (y * width + x) * 3;
        bytes[offset] = color;
        bytes[offset + 1] = color;
        bytes[offset + 2] = color;
      }
    }
  }
}
await writeFile(raw, bytes);
const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
delete env.ELECTRON_RUN_AS_NODE;
env.PATH = [dependencies.ffmpeg.runtimeDllRoot, dependencies.compiler.runtimeDllRoot,
  path.join(dependencies.bestsource.root, 'bin'), env.PATH ?? ''].join(path.delimiter);
const timestampFilter = fixtureKind === 'vfr' ? "setpts=PTS+floor(N/12)*0.083333/TB"
  : fixtureKind === 'offset' ? 'setpts=PTS+5/TB' : null;
await run(dependencies.ffmpeg.path, [
  '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24',
  '-video_size', `${width}x${height}`, '-framerate', '24', '-i', raw,
  ...(timestampFilter ? ['-vf', timestampFilter, '-fps_mode', 'passthrough'] : []),
  '-c:v', 'ffv1', '-level', '3', intermediateMovie,
], env);
if (fixtureKind === 'normalize') {
  const audioFixture = path.join(project, 'tests/fixtures/gif-extraction/generated/cfr-audio.mkv');
  await run(dependencies.ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', intermediateMovie,
    '-stream_loop', '1', '-i', audioFixture, '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', String(frameCount), '-c:v', 'mpeg4', '-g', '12', '-bf', '2',
    '-c:a', 'pcm_s16le', movie,
  ], env);
  const scan = JSON.parse((await runOutput(path.join(project, 'native-build/frame-review/bin/media_packet_scan.exe'),
    [movie], env)).trim());
  if (scan.type !== 'packet-scan' || scan.keyPacketCount < 1 || scan.keyPacketsWithPts !== 0) {
    throw new Error('Normalization fixture did not produce key packets without PTS.');
  }
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
try {
  const page = await app.firstWindow();
  const result = await page.evaluate(async ({ movie, cycles, load, pauseAt }) => {
    const { ElectronFrameReviewService } = await import('./build/src/adapters/electron/electron-frame-review-service.js');
    const { FrameReviewPlayerControl } = await import('./build/src/ui/frame-review-player-control.js');
    const trace = [];
    const deliveries = [];
    const deliveryReads = [];
    const replacements = [];
    const decode = (frame, pixels) => {
      let ordinal = 0;
      for (let bit = 0; bit < 10; bit += 1) {
        const x = Math.floor((bit * 30 + 15) * frame.width / 320);
        const y = Math.floor(50 * frame.height / 180);
        if (pixels[(y * frame.width + x) * 4] > 125) ordinal |= 1 << bit;
      }
      return ordinal;
    };
    window.__clipSandboxFrameReviewPaintProbe = {
      painted(frame, pixels, timeMs) {
        const ordinal = decode(frame, pixels);
        trace.push({ kind: frame.kind, ordinal, timeMs,
          identityOrdinal: frame.kind === 'exact-frame' ? frame.identity.frameIndex : null,
          playerTimeUs: frame.kind === 'playback-frame' ? String(frame.playbackTimestampUs) : null,
          width: frame.width, height: frame.height,
          droppedBeforeWrite: frame.kind === 'playback-frame' ? frame.droppedBeforeWrite ?? null : null,
          previousAckRoundTripMs: frame.kind === 'playback-frame' ? frame.previousAckRoundTripMs ?? null : null,
          sourceGeneration: frame.sourceGeneration, frameGeneration: frame.frameGeneration });
      },
      received(frame, timeMs) {
        if (frame.kind !== 'playback-frame') return;
        deliveryReads.push(frame.pixels.arrayBuffer().then(array => {
          deliveries.push({ ordinal: decode(frame, new Uint8Array(array)), timeMs,
            frameGeneration: frame.frameGeneration, droppedBeforeWrite: frame.droppedBeforeWrite ?? null });
        }));
      },
      replaced() { replacements.push(performance.now()); },
    };
    const loadInterval = load === 'artificial' ? setInterval(() => {
      const until = performance.now() + 6;
      while (performance.now() < until) Math.sqrt(937);
    }, 30) : null;
    await window.clipSandboxDesktop.__testSetNextMoviePath(movie);
    const service = new ElectronFrameReviewService();
    const selected = await service.chooseSource();
    if (!selected) throw new Error('Test movie was not selected.');
    const session = await service.open({ sourceHandle: selected.sourceHandle,
      previewBounds: { maxWidth: 320, maxHeight: 180 } });
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:480px;z-index:99999;background:white';
    document.body.append(host);
    const control = new FrameReviewPlayerControl();
    control.mount(host);
    control.attachSession(session);
    for (let attempt = 0; session.state().phase !== 'exact-ready'; attempt += 1) {
      if (attempt > 1200 || session.state().phase === 'failed') {
        throw new Error(`Exact review preparation failed: ${session.state().message ?? session.state().phase}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const cacheKey = session.state().preparedReview.cacheKey;
    const start = 24;
    const end = 96;
    await control.enterExactScrubAtFrame(start);
    await control.enterExactScrubAtFrame(end);
    await control.enterExactScrubAtFrame(start);
    const exactTiles = trace.filter(item => item.kind === 'exact-frame');
    if (!exactTiles.some(item => item.identityOrdinal === start && item.ordinal === start)
      || !exactTiles.some(item => item.identityOrdinal === end && item.ordinal === end)) {
      throw new Error('Canonical Start/End identity did not match the decoded tile.');
    }
    const commandStartMs = performance.now();
    await control.startExactPreview({ startFrameIndex: start, endFrameIndex: end });
    const deadline = performance.now() + (cycles + 1) * 5000;
    let diagnosticError = null;
    const cycleStarts = () => {
      const starts = [];
      for (const item of trace) {
        if (item.kind !== 'playback-frame' || item.timeMs < commandStartMs) continue;
        if (item.ordinal === start && (starts.length === 0 || item.timeMs - starts.at(-1).timeMs > 1500)) {
          starts.push(item);
        }
      }
      return starts;
    };
    while (cycleStarts().length < cycles + 1) {
      if (performance.now() > deadline) {
        diagnosticError = 'Loop did not paint enough Start pictures.';
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const finalStartMs = cycleStarts().at(-1)?.timeMs ?? commandStartMs;
    const pauseDeadline = performance.now() + 3_000;
    while (performance.now() < pauseDeadline) {
      const last = trace.filter(item => item.kind === 'playback-frame' && item.timeMs >= finalStartMs).at(-1);
      if (last && last.ordinal >= pauseAt && last.ordinal <= Math.min(end, pauseAt + 2)) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const lastPaintBeforePause = trace.filter(item => item.kind === 'playback-frame').at(-1) ?? null;
    const pauseStartMs = performance.now();
    const paused = await control.pauseExactPreview();
    const pauseEndMs = performance.now();
    if (!paused || paused.point.kind !== 'exact-frame') throw new Error('Space did not hand off to exact scrub.');
    const pausedOrdinal = paused.point.identity.frameIndex;
    const stepped = Math.min(end, pausedOrdinal + 1);
    await control.enterExactScrubAtFrame(stepped);
    const resumeStartMs = performance.now();
    await control.resumeExactPreview(stepped);
    await new Promise(resolve => setTimeout(resolve, 250));
    await control.stopExactPreview();
    await Promise.all(deliveryReads);
    await session.dispose();
    control.destroy();
    if (loadInterval !== null) clearInterval(loadInterval);
    delete window.__clipSandboxFrameReviewPaintProbe;
    host.remove();
    return { trace, deliveries, replacements, cacheKey,
      start, end, diagnosticError, commandStartMs, pauseStartMs, pauseEndMs,
      pausedOrdinal, stepped, resumeStartMs, lastPaintBeforePause };
  }, { movie, cycles, load, pauseAt });
  const tracePath = path.join(root, 'painted-pictures.jsonl');
  await writeFile(tracePath, result.trace.map(item => JSON.stringify(item)).join('\n') + '\n');
  await writeFile(path.join(root, 'delivered-pictures.jsonl'), result.deliveries
    .map(item => JSON.stringify(item)).join('\n') + '\n');
  const timeline = JSON.parse(await readFile(path.join(project, 'exact-review-proxy-cache',
    result.cacheKey, 'loop-timeline-v1.json'), 'utf8'));
  const toUs = pts => (BigInt(pts) - BigInt(timeline.pts[0])) * BigInt(timeline.timebaseNumerator)
    * 1_000_000n / BigInt(timeline.timebaseDenominator);
  const expectedCycleMs = Number(toUs(timeline.pts[result.end + 1]) - toUs(timeline.pts[result.start])) / 1000;
  const endIntervalMs = Number(toUs(timeline.pts[result.end + 1]) - toUs(timeline.pts[result.end])) / 1000;
  const playback = result.trace.filter(item => item.kind === 'playback-frame' && item.timeMs >= result.commandStartMs);
  const timerResidualUs = playback.filter(item => item.ordinal >= 0 && item.ordinal < timeline.pts.length
    && item.playerTimeUs !== null).map(item => Number(BigInt(item.playerTimeUs) - toUs(timeline.pts[item.ordinal])));
  const starts = [];
  for (const item of playback) {
    if (item.ordinal === result.start && (starts.length === 0 || item.timeMs - starts.at(-1).timeMs > 1500)) {
      starts.push(item);
    }
  }
  const cycleResults = starts.slice(1).map((nextStart, index) => {
    const currentStart = starts[index];
    const cyclePaints = playback.filter(item => item.timeMs >= currentStart.timeMs && item.timeMs < nextStart.timeMs);
    const cycleDeliveries = result.deliveries.filter(item => item.timeMs >= currentStart.timeMs
      && item.timeMs < nextStart.timeMs);
    const lastEnd = cyclePaints.filter(item => item.ordinal === result.end).at(-1);
    const dwell = cyclePaints.map((item, frameIndex) => ({ ordinal: item.ordinal,
      ms: (cyclePaints[frameIndex + 1] ?? nextStart).timeMs - item.timeMs }));
    const durationMs = nextStart.timeMs - currentStart.timeMs;
    return {
      durationMs,
      deviationPercent: 100 * (durationMs / expectedCycleMs - 1),
      endPaints: cyclePaints.filter(item => item.ordinal === result.end).length,
      endDwellMs: dwell.filter(item => item.ordinal === result.end).map(item => item.ms),
      endDeliveries: cycleDeliveries.filter(item => item.ordinal === result.end).length,
      outsideOrdinals: cyclePaints.filter(item => item.ordinal < result.start || item.ordinal > result.end)
        .map(item => item.ordinal),
      outsideDwellMs: dwell.filter(item => item.ordinal < result.start || item.ordinal > result.end)
        .map(item => item.ms),
      extraSeamMs: lastEnd ? Math.max(0, nextStart.timeMs - lastEnd.timeMs - endIntervalMs) : null,
      nativeDroppedBeforeWriteDelta: (cyclePaints.at(-1)?.droppedBeforeWrite ?? 0)
        - (cyclePaints[0]?.droppedBeforeWrite ?? 0),
      rendererReplacements: result.replacements.filter(timeMs => timeMs >= currentStart.timeMs
        && timeMs < nextStart.timeMs).length,
      maximumPreviousAckRoundTripMs: Math.max(0, ...cyclePaints.map(item => item.previousAckRoundTripMs ?? 0)),
    };
  });
  const summary = {
    fixture: movie, fixtureKind, load, tracePath, requestedCycles: cycles, diagnosticError: result.diagnosticError,
    cacheKey: result.cacheKey, proxyFirstPts: timeline.pts[0],
    distinctProxyIntervals: [...new Set(timeline.pts.slice(1).map((pts, index) => String(BigInt(pts) - BigInt(timeline.pts[index]))))],
    timerResidualUs: { minimum: Math.min(...timerResidualUs), maximum: Math.max(...timerResidualUs),
      median: [...timerResidualUs].sort((a, b) => a - b)[Math.floor(timerResidualUs.length / 2)] ?? null },
    playbackPaints: playback.length,
    paintedStartCount: playback.filter(item => item.ordinal === result.start).length,
    completedWraps: starts.length - 1,
    paintedEndCount: playback.filter(item => item.ordinal === result.end).length,
    deliveredEndCount: result.deliveries.filter(item => item.ordinal === result.end).length,
    outsideCount: playback.filter(item => item.ordinal < result.start || item.ordinal > result.end).length,
    firstPaintedOrdinal: playback[0]?.ordinal ?? null, paintedDimensions: playback[0]
      ? `${playback[0].width}x${playback[0].height}` : null,
    lastPaintedOrdinal: playback.at(-1)?.ordinal ?? null,
    startToStartMs: starts.slice(1).map((item, index) => item.timeMs - starts[index].timeMs),
    expectedCycleMs, cycleResults,
    replacementCount: result.replacements.length,
    startToFirstStartMs: starts[0] ? starts[0].timeMs - result.commandStartMs : null,
    pauseToExactMs: result.pauseEndMs - result.pauseStartMs,
    pausedOrdinal: result.pausedOrdinal,
    lastPaintBeforePause: result.lastPaintBeforePause?.ordinal ?? null,
    pauseOrdinalDifference: result.lastPaintBeforePause
      ? Math.abs(result.pausedOrdinal - result.lastPaintBeforePause.ordinal) : null,
    steppedOrdinal: result.stepped,
  };
  await writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ summaryPath: path.join(root, 'summary.json'), fixtureKind, load,
    requestedCycles: cycles, completedWraps: summary.completedWraps, diagnosticError: summary.diagnosticError,
    paintedEndCount: summary.paintedEndCount, outsideCount: summary.outsideCount,
    pausedOrdinal: summary.pausedOrdinal, lastPaintBeforePause: summary.lastPaintBeforePause,
    startToFirstStartMs: summary.startToFirstStartMs, pauseToExactMs: summary.pauseToExactMs }) + '\n');
} finally {
  await app.close();
}

function run(executable, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

function runOutput(executable, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout)));
  });
}
