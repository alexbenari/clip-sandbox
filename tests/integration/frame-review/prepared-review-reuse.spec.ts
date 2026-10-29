import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { FrameReviewHost } from '../../../src/frame-review/host/frame-review-host.js';
import { nativeBinaryFolder, nativeFrameReviewUnavailableReason, readFrameReviewDependencies } from '../../support/frame-review-dependencies.js';
import { createFiveFrameMovie, openPrepared, runtimeConfiguration } from '../../support/frame-review-host-fixtures.js';

const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'));

describe.skipIf(unavailable !== null)('prepared review production integration', () => {
  it('builds once, reuses in-process, and reuses after a host restart without touching cache mtimes', async () => {
    const dependencies = readFrameReviewDependencies();
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-prepared-review-'));
    const hosts: FrameReviewHost[] = [];
    const startHost = () => { const host = new FrameReviewHost(runtimeConfiguration(root, dependencies)); hosts.push(host); return host; };
    try {
      const movie = await createFiveFrameMovie(root, dependencies);

      const first = await openPrepared(startHost(), movie);
      expect(first.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: false } });
      expectPhasesInOrder(first.phases, ['proxy-encoding', 'proxy-ready', 'indexing', 'exact-ready']);
      const exactFrame = await first.session.enterFrameScrub();
      expect(exactFrame.identity.frameIndex).toBe(0);
      await expect(first.session.captureCurrentPoint()).resolves.toMatchObject({
        kind: 'exact-frame', identity: { frameIndex: 0 },
      });
      const manifestPath = path.join(root, 'exact-review-proxy-cache', first.session.state().preparedReview!.cacheKey, 'manifest.json');
      const timelinePath = path.join(path.dirname(manifestPath), 'loop-timeline-v1.json');
      const timeline = JSON.parse(await readFile(timelinePath, 'utf8'));
      expect(timeline).toMatchObject({
        schemaVersion: 1, frameCount: 5, timebaseNumerator: '1', timebaseDenominator: '1000',
        pts: ['0', '200', '400', '600', '800'],
      });

      // The loop covers frames 0-3 of a five-frame movie, so a pause must land inside it, never on frame 4.
      await first.session.startExactPreview({ startFrameIndex: 0, endFrameIndex: 3 });
      const framesBeforePlayback = first.playbackFrames();
      await vi.waitFor(() => expect(first.playbackFrames()).toBeGreaterThan(framesBeforePlayback + 2), { timeout: 10_000 });
      const paused = await first.session.pauseExactPreview();
      expect(paused.identity.frameIndex).toBeGreaterThanOrEqual(0);
      expect(paused.identity.frameIndex).toBeLessThanOrEqual(3);
      await first.session.resumeExactPreview(paused.identity.frameIndex);
      await first.session.stopExactPreview();
      const firstMtime = (await stat(manifestPath)).mtimeMs;

      const second = await openPrepared(first.host, movie);
      expect(second.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: true } });
      expect(second.phases).not.toContain('proxy-encoding');
      expect(second.phases).not.toContain('proxy-ready');

      // A command that arrives while a session is being disposed must not reach it.
      const closing = first.host.closeSession(second.session.id);
      expect(() => first.host.session(second.session.id)).toThrow('Frame-review session is unknown.');
      await closing;
      await first.host.dispose();

      const restarted = await openPrepared(startHost(), movie);
      expect(restarted.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: true } });
      expect(restarted.phases).not.toContain('indexing');
      expect((await stat(manifestPath)).mtimeMs).toBe(firstMtime);
      await writeFile(timelinePath, '{broken');
      await restarted.host.closeSession(restarted.session.id);
      const repaired = await openPrepared(restarted.host, movie);
      expect(repaired.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: true } });
      expect(JSON.parse(await readFile(timelinePath, 'utf8')).pts).toEqual(timeline.pts);
    } finally {
      await Promise.allSettled(hosts.map(host => host.dispose()));
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});

function expectPhasesInOrder(phases: readonly string[], expected: readonly string[]): void {
  const firstSeen = expected.map(phase => phases.indexOf(phase));
  expect(firstSeen, `phases seen: ${phases.join(', ')}`).not.toContain(-1);
  expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
}
