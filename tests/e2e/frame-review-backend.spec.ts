import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';

import {
  nativeBinaryFolder, nativeFrameReviewUnavailableReason, readFrameReviewDependencies, toolEnvironment,
} from '../support/frame-review-dependencies.js';
import { closeAppWithin, launchApp } from './support/app.js';
import { runTool } from './support/media-tools.js';

const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'));

test.skip(unavailable !== null, unavailable ?? '');

type FrameReviewBridge = {
  __testSetNextMoviePath(path: string): Promise<void>;
  frameReview: {
    chooseSource(): Promise<{ ok: boolean; result: { sourceHandle: string }; error?: { message: string } }>;
    open(request: unknown): Promise<{ ok: boolean; result: { sessionId: string }; error?: { message: string } }>;
    command(sessionId: string, name: string): Promise<{ ok: boolean; result: any; error?: { message: string } }>;
    close(sessionId: string): Promise<unknown>;
  };
};

async function withMovie(prefix: string, run: (movie: string, profile: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const movie = path.join(root, 'source.mp4');
    await createFiveFrameMovie(movie, root);
    await run(movie, path.join(root, 'profile'));
  } finally {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

function collectStderr(app: ElectronApplication): () => string {
  const chunks: string[] = [];
  app.process().stderr?.on('data', chunk => chunks.push(chunk.toString('utf8')));
  return () => chunks.join('');
}

test('Electron reuses prepared review in-session and after restart', async () => {
  test.setTimeout(180_000);
  await withMovie('clip-sandbox-frame-review-e2e-', async (movie, profile) => {
    let app = await launchApp(profile);
    try {
      const firstStderr = collectStderr(app);
      const page = await app.firstWindow();
      const first = await openPrepared(page, movie);
      expect(first.state.phase).toBe('exact-ready');
      expect(first.state.preparedReview.cacheHit).toBe(false);
      const manifestPath = path.join(profile, 'exact-review-proxy-cache', first.state.preparedReview.cacheKey, 'manifest.json');
      const mtime = (await fs.stat(manifestPath)).mtimeMs;

      const exact = await page.evaluate(async sessionId => {
        const api = (window as unknown as { clipSandboxDesktop: FrameReviewBridge }).clipSandboxDesktop.frameReview;
        return { entered: await api.command(sessionId, 'enter-scrub'), capture: await api.command(sessionId, 'capture-current-point') };
      }, first.sessionId);
      expect(exact.entered).toMatchObject({ ok: true, result: { kind: 'exact-frame' } });
      expect(exact.capture).toMatchObject({ ok: true, result: { kind: 'exact-frame' } });

      const second = await openPrepared(page, movie);
      expect(second.state.preparedReview.cacheHit).toBe(true);
      expect((await fs.stat(manifestPath)).mtimeMs).toBe(mtime);
      await page.evaluate(async ids => {
        const api = (window as unknown as { clipSandboxDesktop: FrameReviewBridge }).clipSandboxDesktop.frameReview;
        await Promise.all(ids.map(id => api.close(id)));
      }, [first.sessionId, second.sessionId]);

      await closeAppWithin(app, 10_000);
      expect(firstStderr()).not.toContain('Object has been destroyed');
      app = await launchApp(profile);
      const restartedPage = await app.firstWindow();
      const restarted = await openPrepared(restartedPage, movie);
      expect(restarted.state.preparedReview.cacheHit).toBe(true);
      expect((await fs.stat(manifestPath)).mtimeMs).toBe(mtime);
    } finally {
      await closeAppWithin(app, 10_000).catch(() => undefined);
    }
  });
});

test('Electron closes cleanly while a newly opened review is still preparing', async () => {
  test.setTimeout(120_000);
  await withMovie('clip-sandbox-frame-review-close-', async (movie, profile) => {
    const app = await launchApp(profile);
    const stderr = collectStderr(app);
    try {
      const page = await app.firstWindow();
      await openReview(page, movie);

      await closeAppWithin(app, 10_000);

      expect(stderr()).not.toContain('Object has been destroyed');
    } finally {
      await closeAppWithin(app, 10_000).catch(() => undefined);
    }
  });
});

async function openPrepared(page: Page, movie: string) {
  const opened = await openReview(page, movie);
  const readState = () => page.evaluate(async sessionId => {
    const state = await (window as unknown as { clipSandboxDesktop: FrameReviewBridge }).clipSandboxDesktop.frameReview.command(sessionId, 'state');
    if (!state.ok) throw new Error(state.error?.message);
    return state.result;
  }, opened);
  await expect.poll(async () => (await readState()).phase, { timeout: 90_000 }).toBe('exact-ready');
  return { sessionId: opened, state: await readState() };
}

async function openReview(page: Page, movie: string): Promise<string> {
  return page.evaluate(async moviePath => {
    const desktop = (window as unknown as { clipSandboxDesktop: FrameReviewBridge }).clipSandboxDesktop;
    await desktop.__testSetNextMoviePath(moviePath);
    const source = await desktop.frameReview.chooseSource();
    if (!source.ok) throw new Error(source.error?.message);
    const session = await desktop.frameReview.open({ sourceHandle: source.result.sourceHandle, previewBounds: { maxWidth: 320, maxHeight: 240 } });
    if (!session.ok) throw new Error(session.error?.message);
    return session.result.sessionId;
  }, movie);
}

/** A deterministic five-frame movie: each frame is one flat colour. */
async function createFiveFrameMovie(movie: string, root: string): Promise<void> {
  const dependencies = readFrameReviewDependencies();
  const frameBytes = 64 * 48 * 3;
  const bytes = Buffer.alloc(frameBytes * 5);
  for (let frame = 0; frame < 5; frame += 1) bytes.fill(40 + frame * 40, frame * frameBytes, (frame + 1) * frameBytes);
  const rawVideo = path.join(root, 'source.rgb');
  const rawAudio = path.join(root, 'source.pcm');
  await Promise.all([fs.writeFile(rawVideo, bytes), fs.writeFile(rawAudio, Buffer.alloc(48_000 * 2 * 2))]);
  await runTool(dependencies.ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x48', '-framerate', '5', '-i', rawVideo,
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
    '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'aac', '-shortest', movie,
  ], toolEnvironment(dependencies));
}

