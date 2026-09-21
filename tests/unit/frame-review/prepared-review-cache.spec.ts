import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FrameReviewPaths } from '../../../src/frame-review/host/frame-review-paths.js';
import {
  PreparedReviewCache,
  type IPreparedReviewBuildResult,
  type IPreparedReviewIdentity,
} from '../../../src/frame-review/host/prepared-review-cache.js';

const identity: IPreparedReviewIdentity = Object.freeze({
  schemaVersion: 1,
  sourceSampleDigest: 'source-digest',
  sourceBytes: '1200',
  sourceDurationUs: '2000000',
  signatureProfileVersion: 'sample-signature-compact-v1',
  preparationContractVersion: 'prepared-review-v1',
  selectedStream: 0,
  streamMetadataDigest: 'stream-digest',
  nativeProtocolVersion: 1,
  bestSourceVersion: 'bestsource-test',
  ffmpegVersion: 'ffmpeg-test',
  proxyProfileId: 'mpeg4-gop1-q5-960-source-clock-aac-v1',
  frameMapVersion: 'ordinal-identity-v1',
  indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268435456 }),
});

describe('prepared review cache', () => {
  it('publishes once and reuses the same durable entry without touching its manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const cache = new PreparedReviewCache(new FrameReviewPaths(root));
    let builds = 0;
    const build = async (workspace: IPreparedReviewBuildResult['workspace']): Promise<IPreparedReviewBuildResult> => {
      builds += 1;
      await writeFile(`${workspace.canonicalIndexFile}.0.bsindex`, 'index');
      await writeFile(workspace.proxyFile, 'proxy');
      await writeFile(`${workspace.proxyIndexFile}.0.bsindex`, 'proxy-index');
      await writeFile(workspace.frameMapFile, JSON.stringify({ schemaVersion: 1, mapping: 'ordinal-identity', frameCount: 4 }));
      return { workspace, frameCount: 4, sourceWidth: 64, sourceHeight: 48, durationUs: '2000000' };
    };

    const cold = await cache.getOrCreate(identity, build);
    const manifestBefore = await stat(cold.manifestPath);
    const warm = await cache.getOrCreate(identity, build);
    const manifestAfter = await stat(warm.manifestPath);

    expect(builds).toBe(1);
    expect(cold.cacheHit).toBe(false);
    expect(warm.cacheHit).toBe(true);
    expect(manifestAfter.mtimeMs).toBe(manifestBefore.mtimeMs);
    expect(JSON.parse(await readFile(warm.manifestPath, 'utf8')).identity).toEqual(identity);
  });

  it('coalesces concurrent writers for one identity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const cache = new PreparedReviewCache(new FrameReviewPaths(root));
    let builds = 0;
    const build = async (workspace: IPreparedReviewBuildResult['workspace']): Promise<IPreparedReviewBuildResult> => {
      builds += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await Promise.all([
        writeFile(`${workspace.canonicalIndexFile}.0.bsindex`, 'index'),
        writeFile(workspace.proxyFile, 'proxy'),
        writeFile(`${workspace.proxyIndexFile}.0.bsindex`, 'proxy-index'),
        writeFile(workspace.frameMapFile, '{"schemaVersion":1,"mapping":"ordinal-identity","frameCount":4}'),
      ]);
      return { workspace, frameCount: 4, sourceWidth: 64, sourceHeight: 48, durationUs: '2000000' };
    };

    const [first, second] = await Promise.all([
      cache.getOrCreate(identity, build),
      cache.getOrCreate(identity, build),
    ]);
    expect(builds).toBe(1);
    expect(first.cacheKey).toBe(second.cacheKey);
  });

  it('keeps a shared writer alive when one of two consumers cancels', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const cache = new PreparedReviewCache(new FrameReviewPaths(root));
    const firstConsumer = new AbortController();
    const secondConsumer = new AbortController();
    let builds = 0;
    let releaseBuild: (() => void) | undefined;
    const buildGate = new Promise<void>((resolve) => { releaseBuild = resolve; });
    let markBuildStarted: (() => void) | undefined;
    const buildStarted = new Promise<void>((resolve) => { markBuildStarted = resolve; });
    const build = async (
      workspace: IPreparedReviewBuildResult['workspace'],
      writerSignal: AbortSignal,
    ): Promise<IPreparedReviewBuildResult> => {
      builds += 1;
      markBuildStarted?.();
      await buildGate;
      if (writerSignal.aborted) throw new DOMException('cancelled', 'AbortError');
      await Promise.all([
        writeFile(`${workspace.canonicalIndexFile}.0.bsindex`, 'index'),
        writeFile(workspace.proxyFile, 'proxy'),
        writeFile(`${workspace.proxyIndexFile}.0.bsindex`, 'proxy-index'),
        writeFile(workspace.frameMapFile, '{"schemaVersion":1,"mapping":"ordinal-identity","frameCount":4}'),
      ]);
      return { workspace, frameCount: 4, sourceWidth: 64, sourceHeight: 48, durationUs: '2000000' };
    };

    const first = cache.getOrCreate(identity, build, firstConsumer.signal);
    const second = cache.getOrCreate(identity, build, secondConsumer.signal);
    await buildStarted;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    firstConsumer.abort();
    releaseBuild?.();

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toMatchObject({ cacheHit: false });
    expect(builds).toBe(1);
  });

  it('rebuilds a stale manifest and removes abandoned partial workspaces', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const cache = new PreparedReviewCache(new FrameReviewPaths(root));
    let builds = 0;
    const build = async (workspace: IPreparedReviewBuildResult['workspace']): Promise<IPreparedReviewBuildResult> => {
      builds += 1;
      await Promise.all([
        writeFile(`${workspace.canonicalIndexFile}.0.bsindex`, 'index'),
        writeFile(workspace.proxyFile, 'proxy'),
        writeFile(`${workspace.proxyIndexFile}.0.bsindex`, 'proxy-index'),
        writeFile(workspace.frameMapFile, '{"schemaVersion":1,"mapping":"ordinal-identity","frameCount":4}'),
      ]);
      return { workspace, frameCount: 4, sourceWidth: 64, sourceHeight: 48, durationUs: '2000000' };
    };
    const first = await cache.getOrCreate(identity, build);
    const manifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
    manifest.identity.ffmpegVersion = 'stale-version';
    await writeFile(first.manifestPath, JSON.stringify(manifest));

    const rebuilt = await cache.getOrCreate(identity, build);
    expect(builds).toBe(2);
    expect(rebuilt.cacheHit).toBe(false);
    expect(JSON.parse(await readFile(rebuilt.manifestPath, 'utf8')).identity.ffmpegVersion).toBe('ffmpeg-test');
  });

  it('invalidates changed source bytes and an incompatible cached protocol', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const cache = new PreparedReviewCache(new FrameReviewPaths(root));
    let builds = 0;
    const build = async (workspace: IPreparedReviewBuildResult['workspace']): Promise<IPreparedReviewBuildResult> => {
      builds += 1;
      await Promise.all([
        writeFile(`${workspace.canonicalIndexFile}.0.bsindex`, 'index'),
        writeFile(workspace.proxyFile, 'proxy'),
        writeFile(`${workspace.proxyIndexFile}.0.bsindex`, 'proxy-index'),
        writeFile(workspace.frameMapFile, '{"schemaVersion":1,"mapping":"ordinal-identity","frameCount":4}'),
      ]);
      return { workspace, frameCount: 4, sourceWidth: 64, sourceHeight: 48, durationUs: '2000000' };
    };
    const first = await cache.getOrCreate(identity, build);
    const changedSource = Object.freeze({ ...identity, sourceBytes: '1201' });
    await cache.getOrCreate(changedSource, build);
    const firstManifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
    firstManifest.identity.nativeProtocolVersion = 0;
    await writeFile(first.manifestPath, JSON.stringify(firstManifest));
    const rebuilt = await cache.getOrCreate(identity, build);

    expect(builds).toBe(3);
    expect(rebuilt.cacheHit).toBe(false);
    expect(JSON.parse(await readFile(rebuilt.manifestPath, 'utf8')).identity.nativeProtocolVersion).toBe(1);
  });

  it('surfaces an actionable cache error when the mandated application folder is not writable as a directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const file = path.join(root, 'application-file');
    await writeFile(file, 'not a directory');
    const cache = new PreparedReviewCache(new FrameReviewPaths(file));
    await expect(cache.getOrCreate(identity, async () => { throw new Error('builder must not run'); }))
      .rejects.toMatchObject({ category: 'cache-unavailable', recoverable: false });
  });

  it('does not publish or retain temporary entries after a cancelled build', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-frame-review-'));
    const paths = new FrameReviewPaths(root);
    const cache = new PreparedReviewCache(paths);
    await expect(cache.getOrCreate(identity, async (workspace) => {
      await writeFile(workspace.proxyFile, 'partial');
      throw new DOMException('cancelled', 'AbortError');
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readdir(paths.frameIndexCache)).toEqual([]);
    expect(await readdir(paths.proxyCache)).toEqual([]);
  });
});
