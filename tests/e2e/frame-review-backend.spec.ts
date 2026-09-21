// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';

const project = path.resolve('.');
const dependenciesPath = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'bestsource_media_service.exe');

test.skip(process.platform !== 'win32' || !existsSync(dependenciesPath) || !existsSync(nativeService),
  'The explicit frame-review native build is not available.');

test('Electron reuses prepared review in-session and after restart', async () => {
  test.setTimeout(180_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-e2e-'));
  const clips = path.join(root, 'clips');
  const profile = path.join(root, 'profile');
  await fs.mkdir(clips);
  const dependencies = JSON.parse(await fs.readFile(dependenciesPath, 'utf8'));
  const movie = path.join(clips, 'source.mp4');
  await createMovie(movie, root, dependencies.ffmpeg.path, dependencies);

  let app = await launch(profile);
  const firstMainStderr = [];
  app.process().stderr?.on('data', (chunk) => firstMainStderr.push(chunk.toString('utf8')));
  try {
    const page = await app.firstWindow();
    const first = await openPrepared(page, movie);
    expect(first.state.phase).toBe('exact-ready');
    expect(first.state.preparedReview.cacheHit).toBe(false);
    const cacheKey = first.state.preparedReview.cacheKey;
    const manifestPath = path.join(project, 'exact-review-proxy-cache', cacheKey, 'manifest.json');
    const mtime = (await fs.stat(manifestPath)).mtimeMs;

    const exact = await page.evaluate(async ({ sessionId }) => {
      const api = window.clipSandboxDesktop.frameReview;
      const entered = await api.command(sessionId, 'enter-scrub');
      const capture = await api.command(sessionId, 'capture-current-point');
      return { entered, capture };
    }, { sessionId: first.sessionId });
    expect(exact.entered).toMatchObject({ ok: true, result: { kind: 'exact-frame' } });
    expect(exact.capture).toMatchObject({ ok: true, result: { kind: 'exact-frame' } });

    const second = await openPrepared(page, movie);
    expect(second.state.preparedReview.cacheHit).toBe(true);
    expect((await fs.stat(manifestPath)).mtimeMs).toBe(mtime);
    await page.evaluate(async (ids) => {
      await Promise.all(ids.map((id) => window.clipSandboxDesktop.frameReview.close(id)));
    }, [first.sessionId, second.sessionId]);

    await closeAppWithin(app, 10_000);
    expect(firstMainStderr.join('')).not.toContain('Object has been destroyed');
    app = await launch(profile);
    const restartedPage = await app.firstWindow();
    const restarted = await openPrepared(restartedPage, movie);
    expect(restarted.state.preparedReview.cacheHit).toBe(true);
    expect((await fs.stat(manifestPath)).mtimeMs).toBe(mtime);
    await restartedPage.evaluate((sessionId) => window.clipSandboxDesktop.frameReview.close(sessionId), restarted.sessionId);
  } finally {
    await closeAppWithin(app, 10_000).catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('Electron closes cleanly while a cold prepared review is still starting', async () => {
  test.setTimeout(120_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-close-'));
  const clips = path.join(root, 'clips');
  const profile = path.join(root, 'profile');
  await fs.mkdir(clips);
  const dependencies = JSON.parse(await fs.readFile(dependenciesPath, 'utf8'));
  const movie = path.join(clips, 'source.mp4');
  await createMovie(movie, root, dependencies.ffmpeg.path, dependencies);

  const app = await launch(profile);
  const mainStderr = [];
  app.process().stderr?.on('data', chunk => mainStderr.push(chunk.toString('utf8')));
  try {
    const page = await app.firstWindow();
    const opened = await page.evaluate(async moviePath => {
      const desktop = window.clipSandboxDesktop;
      await desktop.__testSetNextMoviePath(moviePath);
      const source = await desktop.frameReview.chooseSource();
      if (!source.ok) throw new Error(source.error.message);
      return desktop.frameReview.open({
        sourceHandle: source.result.sourceHandle,
        previewBounds: { maxWidth: 320, maxHeight: 240 },
      });
    }, movie);
    expect(opened).toMatchObject({ ok: true });
    expect(opened.result.state.phase).not.toBe('exact-ready');

    await closeAppWithin(app, 10_000);

    expect(mainStderr.join('')).not.toContain('Object has been destroyed');
  } finally {
    await closeAppWithin(app, 10_000).catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function launch(profile) {
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: project,
    env,
  });
}

async function closeAppWithin(app, milliseconds) {
  let timer;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          app.process().kill();
          reject(new Error(`Electron shutdown exceeded ${milliseconds}ms.`));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function openPrepared(page, movie) {
  return page.evaluate(async (moviePath) => {
    const withTimeout = (promise, label, milliseconds = 20_000) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds)),
    ]);
    const desktop = window.clipSandboxDesktop;
    await withTimeout(desktop.__testSetNextMoviePath(moviePath), 'test movie selection');
    const source = await withTimeout(desktop.frameReview.chooseSource(), 'movie selection');
    if (!source.ok) throw new Error(source.error.message);
    const opened = await withTimeout(desktop.frameReview.open({
      sourceHandle: source.result.sourceHandle,
      previewBounds: { maxWidth: 320, maxHeight: 240 },
    }), 'frame-review open', 70_000);
    if (!opened.ok) throw new Error(opened.error.message);
    const sessionId = opened.result.sessionId;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const state = await desktop.frameReview.command(sessionId, 'state');
      if (!state.ok) throw new Error(state.error.message);
      if (state.result.phase === 'exact-ready') return { sessionId, state: state.result };
      if (state.result.phase === 'failed') throw new Error(state.result.message);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Prepared review did not become ready.');
  }, movie);
}

async function createMovie(movie, root, ffmpeg, dependencies) {
  const rawVideo = path.join(root, 'source.rgb');
  const rawAudio = path.join(root, 'source.pcm');
  const bytes = Buffer.alloc(64 * 48 * 3 * 5);
  const colors = randomBytes(5 * 3);
  for (let frame = 0; frame < 5; frame += 1) {
    const start = frame * 64 * 48 * 3;
    const end = (frame + 1) * 64 * 48 * 3;
    for (let offset = start; offset < end; offset += 3) {
      colors.copy(bytes, offset, frame * 3, frame * 3 + 3);
    }
  }
  await Promise.all([
    fs.writeFile(rawVideo, bytes),
    fs.writeFile(rawAudio, Buffer.alloc(48_000 * 2 * 2)),
  ]);
  await run(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x48', '-framerate', '5', '-i', rawVideo,
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
    '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'aac', '-shortest', movie,
  ], {
    ...process.env,
    PATH: [dependencies.ffmpeg.runtimeDllRoot, dependencies.compiler.runtimeDllRoot, process.env.PATH ?? ''].join(path.delimiter),
  });
}

function run(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}
