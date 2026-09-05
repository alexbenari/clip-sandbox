import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { InteractivePreparationService } from '../../src/preparation/interactive-preparation.mjs';
import { AllIntraProxyPreparationService } from '../../src/preparation/all-intra-proxy-preparation.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..', '..');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const tools = {
  sampleSignature: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_sample_signature.exe'),
  packetScanner: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_packet_scan.exe'),
  bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
  ffmpeg: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe'),
};
const nativeAvailable = Object.values(tools).every(existsSync);

describe.skipIf(!nativeAvailable)('interactive preparation service', () => {
  it('prepares a selected movie into an atomic cache entry and reuses it', async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'frame-control-preparation-'));
    const fixture = JSON.parse(readFileSync(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'))
      .fixtures.find((candidate: { id: string }) => candidate.id === 'cfr-ffv1');
    const manifest = JSON.parse(readFileSync(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
    const events: Array<Record<string, unknown>> = [];
    const service = new InteractivePreparationService({
      cacheRoot,
      ...tools,
      bestSourceVersion: manifest.dependencies.bestsource.version,
      ffmpegVersion: manifest.dependencies.ffmpeg.version,
      environment: nativeEnvironment(),
    });

    try {
      const prepared = await service.prepare(fixture.path, (event: Record<string, unknown>) => events.push(event));
      expect(prepared).toMatchObject({ cacheHit: false, reviewAssetKind: 'source', numFrames: 72 });
      expect(existsSync(`${prepared.indexPath}.0.bsindex`)).toBe(true);
      expect(events).toContainEqual(expect.objectContaining({ type: 'preparation-progress', phase: 'indexing', percent: 100 }));

      const reopened = await service.prepare(fixture.path);
      expect(reopened).toMatchObject({ cacheHit: true, indexPath: prepared.indexPath, numFrames: 72 });

      const proxyService = new AllIntraProxyPreparationService({
        cacheRoot: path.join(cacheRoot, 'proxies'),
        ffmpeg: tools.ffmpeg,
        ffprobe: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe'),
        bestSourceHarness: tools.bestSourceHarness,
        bestSourceVersion: manifest.dependencies.bestsource.version,
        ffmpegVersion: manifest.dependencies.ffmpeg.version,
        environment: nativeEnvironment(),
      });
      const proxy = await proxyService.prepare(prepared);
      expect(proxy).toMatchObject({
        cacheHit: false,
        numFrames: 72,
        mapping: { complete: true, canonicalFrameCount: 72, proxyFrameCount: 72 },
        profile: { maxWidth: 960, quantizer: 5, gopSize: 1, bFrames: 0 },
      });
      expect(existsSync(proxy.proxyAssetPath)).toBe(true);
      expect(existsSync(`${proxy.proxyIndexPath}.0.bsindex`)).toBe(true);
      expect(existsSync(proxy.frameMapPath)).toBe(true);

      const reopenedProxy = await proxyService.prepare(prepared);
      expect(reopenedProxy).toMatchObject({ cacheHit: true, proxyAssetPath: proxy.proxyAssetPath, numFrames: 72 });
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it('reports a helper failure and removes its unpublished cache workspace', async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'frame-control-preparation-failure-'));
    const fixture = JSON.parse(readFileSync(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'))
      .fixtures.find((candidate: { id: string }) => candidate.id === 'cfr-ffv1');
    const manifest = JSON.parse(readFileSync(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
    const service = new InteractivePreparationService({
      cacheRoot,
      ...tools,
      packetScanner: path.join(cacheRoot, 'missing-packet-scanner.exe'),
      bestSourceVersion: manifest.dependencies.bestsource.version,
      ffmpegVersion: manifest.dependencies.ffmpeg.version,
      environment: nativeEnvironment(),
    });

    try {
      await expect(service.prepare(fixture.path)).rejects.toThrow();
      expect(await readdir(cacheRoot)).toEqual([]);
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }, 30_000);
});

function nativeEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [
      path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
      path.join(releaseRoot, 'bin'),
      path.join(releaseRoot, 'tools', 'ffmpeg'),
      'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
      process.env.PATH,
    ].join(';'),
  };
}
