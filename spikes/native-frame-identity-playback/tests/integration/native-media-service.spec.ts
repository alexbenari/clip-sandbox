import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BestSourceFramePlaybackAdapter } from '../../src/adapter/bestsource-frame-playback-adapter.js';
import { NativeProcessClient } from '../../src/adapter/native-process-client.js';
import { AllIntraProxyPreparationService } from '../../src/preparation/all-intra-proxy-preparation.mjs';
import { decodeFrameCodeFromRgba } from '../../src/tooling/frame-code.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..', '..');
const executable = path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_media_service.exe');
const rawPath = path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json');
const fixtureManifest = JSON.parse(readFileSync(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
const nativeAvailable = existsSync(executable) && existsSync(rawPath);

describe.skipIf(!nativeAvailable)('native media service', () => {
  it('opens one persistent BestSource index and returns exact adjacent RGBA frames', async () => {
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const target = raw.results.find((result: { id: string }) => result.id === 'fixture-cfr-ffv1');
    const adapter = new BestSourceFramePlaybackAdapter(new NativeProcessClient({
      executable,
      env: nativeEnvironment(),
    }));

    try {
      const status = await adapter.open({
        reviewAssetPath: target.reviewAsset,
        indexPath: target.index,
        previewBounds: { maxWidth: 160, maxHeight: 90 },
      });
      expect(status).toMatchObject({ state: 'exact-ready', numFrames: 72 });

      const first = await adapter.getExactFrame(0);
      const second = await adapter.stepAdjacent(1);
      const oneSecond = await adapter.getFrameAtTime(1_000_000n);
      expect(first.identity.frameIndex).toBe(0);
      expect(second.identity.frameIndex).toBe(1);
      expect(oneSecond.identity.frameIndex).toBe(24);
      expect(oneSecond.identity.pts).toBe(1_000n);
      expect({ width: second.width, height: second.height }).toEqual({ width: 160, height: 90 });
      expect({ width: second.sourceWidth, height: second.sourceHeight }).toEqual({ width: 320, height: 180 });
      expect(second.pixels.byteLength).toBe(second.width * second.height * 4);
      expect(second.pixelFormat).toBe('RGBA8888');
      expect(second.timings.nativeRoundTripMs).toBeGreaterThan(0);
    } finally {
      await adapter.shutdown();
    }
  }, 30_000);

  it.each([
    ['fixture-cfr-ffv1', 'b'],
    ['fixture-vfr-ffv1', 'c'],
  ])('renders proxy pixels in canonical ordinal order for %s', async (targetId, cacheKeyCharacter) => {
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const target = raw.results.find((result: { id: string }) => result.id === targetId);
    const fixture = fixtureManifest.fixtures.find((candidate: { id: string }) =>
      `fixture-${candidate.id}` === targetId);
    const dependencyManifest = JSON.parse(readFileSync(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'proxy-identity-service-'));
    const proxyService = new AllIntraProxyPreparationService({
      cacheRoot,
      ffmpeg: path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release', 'tools', 'ffmpeg', 'ffmpeg.exe'),
      ffprobe: path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release', 'tools', 'ffmpeg', 'ffprobe.exe'),
      bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
      bestSourceVersion: dependencyManifest.dependencies.bestsource.version,
      ffmpegVersion: dependencyManifest.dependencies.ffmpeg.version,
      environment: nativeEnvironment(),
    });
    const canonicalSource = {
      cacheKey: cacheKeyCharacter.repeat(64),
      reviewAssetPath: target.reviewAsset,
      indexPath: target.index,
      numFrames: target.numFrames,
      durationUs: 3_000_000,
    };
    const proxy = await proxyService.prepare(canonicalSource);
    const canonical = new BestSourceFramePlaybackAdapter(new NativeProcessClient({ executable, env: nativeEnvironment() }));
    const mapped = new BestSourceFramePlaybackAdapter(new NativeProcessClient({ executable, env: nativeEnvironment() }));

    try {
      await canonical.open({
        reviewAssetPath: target.reviewAsset,
        indexPath: target.index,
        previewBounds: { maxWidth: 320, maxHeight: 180 },
      });
      await mapped.open({
        reviewAssetPath: proxy.proxyAssetPath,
        indexPath: proxy.proxyIndexPath,
        identitySource: {
          reviewAssetPath: target.reviewAsset,
          indexPath: target.index,
        },
        previewBounds: { maxWidth: 960, maxHeight: 540 },
      });
      for (const frameIndex of [0, Math.floor(target.numFrames / 2), target.numFrames - 1]) {
        const [canonicalFrame, proxyFrame] = await Promise.all([
          canonical.getExactFrame(frameIndex),
          mapped.getExactFrame(frameIndex),
        ]);
        expect(proxyFrame.identity).toEqual(canonicalFrame.identity);
        expect(proxyFrame.identity.frameIndex).toBe(frameIndex);
        const resolvedFromProxyClock = await mapped.getFrameAtTime(proxyFrame.reviewTimeUs);
        expect(resolvedFromProxyClock.identity.frameIndex).toBe(frameIndex);
        expect(proxyFrame.sourceWidth).toBeLessThanOrEqual(960);
        expect(decodeFrameCodeFromRgba(proxyFrame.pixels, proxyFrame.width, proxyFrame.height))
          .toBe(fixture.frames[frameIndex].sourceCode);
      }
    } finally {
      await Promise.all([canonical.shutdown(), mapped.shutdown()]);
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

function nativeEnvironment(): NodeJS.ProcessEnv {
  const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
  return {
    ...process.env,
    PATH: [
      path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
      path.join(releaseRoot, 'bin'),
      'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
      process.env.PATH,
    ].join(';'),
  };
}
