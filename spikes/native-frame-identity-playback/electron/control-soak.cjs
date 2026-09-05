const { writeFile, readFile } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');

async function runControlSoak({ window, app, output, spikeRoot, diagnostics, seconds, shutdown }) {
  let timer;
  let sampler;
  let samplerDone;
  let sampleLog = '';
  const queueSamples = [];
  const resourcesPath = output.replace(/\.json$/i, '-resources.jsonl');
  const stopPath = output.replace(/\.json$/i, '-stop');
  const startedAt = new Date().toISOString();
  let evidence;
  try {
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) throw new Error('Invalid soak duration.');
    if (!process.env.FRAME_CONTROL_AUTO_SOURCE) throw new Error('A soak source is required.');
    sampler = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(spikeRoot, 'scripts', 'sample-soak-resources.ps1'), '-RootPid', String(process.pid),
      '-OutputPath', resourcesPath, '-StopPath', stopPath], {
      windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    samplerDone = new Promise((resolve) => {
      sampler.on('error', (error) => resolve({ error: error.message }));
      sampler.on('close', (code) => resolve({ code, log: sampleLog }));
    });
    sampler.stdout.on('data', (data) => { sampleLog = (sampleLog + data.toString()).slice(-4000); });
    sampler.stderr.on('data', (data) => { sampleLog = (sampleLog + data.toString()).slice(-4000); });
    const started = performance.now();
    timer = setInterval(() => queueSamples.push({ atMs: performance.now() - started, ...diagnostics() }), 100);
    evidence = await window.webContents.executeJavaScript(
      `(${soakJourney.toString()})(${JSON.stringify({ seconds })})`);
    const screenshotPath = output.replace(/\.json$/i, '.png');
    await writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
    evidence.screenshotPath = screenshotPath;
  } catch (error) {
    evidence = { error: String(error?.stack ?? error) };
  } finally {
    clearInterval(timer);
    await writeFile(stopPath, 'stop', 'utf8');
    const sampleResult = samplerDone ? await Promise.race([
      samplerDone, new Promise((resolve) => setTimeout(() => resolve({ error: 'Resource sampler stop timeout' }), 10000)),
    ]) : { error: 'Resource sampler did not start' };
    if (sampleResult.code !== 0) {
      sampler?.kill();
      evidence.error ??= sampleResult.error ?? `Resource sampler failed: ${sampleResult.log}`;
    }
    let resourceSamples = [];
    try {
      resourceSamples = (await readFile(resourcesPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean)
        .map((line) => JSON.parse(line.replace(/^\uFEFF/, '')));
    } catch (error) { evidence.error ??= `Resource evidence unavailable: ${error.message}`; }
    const final = { schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
      requestedSeconds: seconds, ...evidence, queueSamples, resourceSamples };
    await writeFile(output, JSON.stringify(final, null, 2) + '\n', 'utf8');
    await shutdown().catch((error) => { console.error(error.message); });
    app.exit(evidence.error ? 1 : 0);
  }
}

async function soakJourney({ seconds }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const el = (id) => document.getElementById(id);
  const key = (type, value) => window.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true }));
  const tap = (value) => { key('keydown', value); key('keyup', value); };
  const frameNumber = () => {
    const text = el('frame-identity').textContent;
    return text.startsWith('Frame ') ? Number(text.replace(/[^0-9]/g, '')) : null;
  };
  const wait = async (predicate, label, timeout = 65000) => {
    const started = performance.now();
    while (!(await predicate())) {
      const error = el('player-error').textContent;
      if (error) throw new Error(error);
      if (performance.now() - started > timeout) throw new Error(`Timed out: ${label}`);
      await sleep(25);
    }
    if (el('player-error').textContent) throw new Error(el('player-error').textContent);
  };
  const open = async () => {
    const generation = (await window.frameIdentityControl.status()).generation;
    el('open-movie').click();
    await wait(async () => (await window.frameIdentityControl.status()).generation !== generation, 'source open');
    await wait(() => !el('play-pause').disabled && el('video-canvas').classList.contains('visible') &&
      el('busy-state').hidden, 'opening picture');
    await wait(async () => (await window.frameIdentityControl.status()).exactReady &&
      !document.querySelector('.exact-control').disabled, 'exact-ready', 1800000);
    return window.frameIdentityControl.status();
  };
  const snapshot = async () => {
    const canvas = el('video-canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', data);
    const pixelSha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    const frame = await window.frameIdentityControl.captureCurrentFrame();
    if (frame.identity.frameIndex !== frameNumber()) throw new Error('Canvas label and captured identity disagree.');
    if (!canvas.width || !canvas.height || !data.some((value, index) => index % 4 === 3 && value)) {
      throw new Error('Canvas is blank or transparent.');
    }
    return { identity: frame.identity, pixelSha256, width: canvas.width, height: canvas.height };
  };
  let state = await open();
  const operations = [];
  const measured = async (kind, action) => {
    const started = performance.now();
    const result = await action();
    operations.push({ kind, elapsedMs: performance.now() - started });
    return result;
  };
  const seek = async (ratio) => {
    const timeline = el('timeline');
    timeline.value = String(Math.round(ratio * Number(timeline.max)));
    const expected = Math.round(Number(timeline.value) / Number(timeline.max) * (state.numFrames - 1));
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(() => el('scrub-state').hidden && frameNumber() === expected, `frame ${expected}`);
    await sleep(40);
    if (frameNumber() !== expected) throw new Error('A stale picture overwrote the settled seek.');
    return snapshot();
  };
  const step = async (direction) => {
    const before = frameNumber();
    tap(direction > 0 ? 'ArrowRight' : 'ArrowLeft');
    await wait(() => frameNumber() !== before, 'adjacent step');
    if (frameNumber() !== before + direction) throw new Error('Adjacent tap skipped a frame.');
  };
  const captureRange = async (ratio) => {
    const start = await seek(ratio);
    tap('q');
    await wait(() => el('draft-start').textContent.includes('Frame'), 'start mark');
    for (let i = 0; i < 3; i++) await step(1);
    const end = await snapshot();
    tap('w');
    await wait(() => el('draft-end').textContent.includes('Frame'), 'end mark');
    tap('a');
    await wait(() => el('draft-state').textContent === 'Locked', 'range lock');
    return { start, end };
  };
  const points = [0.05, 0.25, 0.5, 0.75, 0.95];
  const before = [];
  for (const ratio of points) before.push(await measured('exact-landing', () => seek(ratio)));
  const rangesBefore = [await captureRange(0.15), await captureRange(0.65)];
  const soakStartedAt = new Date().toISOString();
  const started = performance.now();
  let cycles = 0;
  let heldFrames = 0;
  let playbackFrames = 0;
  const unsubscribe = window.frameIdentityControl.onPlaybackFrame(() => { playbackFrames++; });
  while (performance.now() - started < seconds * 1000) {
    await measured('random-landing', () => seek(points[cycles % points.length]));
    await measured('forward-step', () => step(1));
    await measured('reverse-step', () => step(-1));
    await measured('held-step', async () => {
      const direction = cycles % 2 ? -1 : 1;
      const seen = [frameNumber()];
      const observer = new MutationObserver(() => {
        const frame = frameNumber();
        if (frame !== null && seen.at(-1) !== frame) seen.push(frame);
      });
      observer.observe(el('frame-identity'), { childList: true, characterData: true, subtree: true });
      const arrow = direction > 0 ? 'ArrowRight' : 'ArrowLeft';
      key('keydown', arrow);
      try { await sleep(650); } finally { key('keyup', arrow); }
      await sleep(250);
      observer.disconnect();
      if (seen.length < 3 || seen.some((frame, index) => index && frame !== seen[index - 1] + direction)) {
        throw new Error(`Held stepping lost adjacency: ${seen}`);
      }
      heldFrames += seen.length - 1;
    });
    await measured('scrub-burst', async () => {
      const timeline = el('timeline');
      for (let i = 0; i < 18; i++) {
        timeline.value = String(10000 + ((cycles * 7100 + i * 3900) % 80000));
        timeline.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(20);
      }
      const expected = Math.round(Number(timeline.value) / Number(timeline.max) * (state.numFrames - 1));
      await wait(() => el('scrub-state').hidden && frameNumber() === expected, 'burst settlement');
      await sleep(100);
      if (frameNumber() !== expected) throw new Error('Stale scrub result after settlement.');
    });
    await measured('release-to-play', async () => {
      el('timeline').dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => el('busy-state').hidden && el('play-pause').title === 'Pause', 'release resumes playback');
    });
    const rate = el('playback-rate');
    rate.value = String([0.5, 1, 2, 1][cycles % 4]);
    rate.dispatchEvent(new Event('change', { bubbles: true }));
    const playbackBefore = playbackFrames;
    await sleep(1400);
    await wait(() => playbackFrames > playbackBefore, 'moving playback pictures');
    await measured('pause-to-exact', async () => {
      tap(' ');
      await wait(() => el('busy-state').hidden && el('play-pause').title === 'Play' && frameNumber() !== null,
        'Space pauses into exact review');
    });
    cycles++;
  }
  unsubscribe();
  const elapsedMs = performance.now() - started;
  const soakFinishedAt = new Date().toISOString();
  state = await open();
  const after = [];
  for (const ratio of points) after.push(await seek(ratio));
  const rangesAfter = [await captureRange(0.15), await captureRange(0.65)];
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Exact points or pixels changed after reopen.');
  if (JSON.stringify(rangesBefore) !== JSON.stringify(rangesAfter)) throw new Error('Range boundary changed after reopen.');
  return { sourceName: state.sourceName, numFrames: state.numFrames, playbackAssetKind: state.playbackAssetKind,
    proxyProfile: state.proxyProfile, proxyPreparation: state.proxyPreparation,
    soakStartedAt, soakFinishedAt, elapsedMs, cycles, heldFrames, playbackFrames, operations,
    reopen: { pointCount: points.length, rangeCount: 2, identical: true, points: before, ranges: rangesBefore },
    playerError: el('player-error').textContent };
}

module.exports = { runControlSoak };
