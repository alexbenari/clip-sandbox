import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BestSourceFramePlaybackAdapter } from '../../src/adapter/bestsource-frame-playback-adapter.js';
import type { PlaybackDisplayFrame } from '../../src/adapter/frame-playback-adapter.js';
import { HybridFramePlaybackAdapter } from '../../src/adapter/hybrid-frame-playback-adapter.js';
import { LibVlcPlaybackAdapter } from '../../src/adapter/libvlc-playback-adapter.js';
import { NativeProcessClient } from '../../src/adapter/native-process-client.js';
import { sourceFrameTimeUs } from '../../src/model/source-frame-identity.js';

const spikeRoot = path.resolve(import.meta.dirname, '..', '..');
const exactExecutable = path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_media_service.exe');
const playbackExecutable = path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_media_service.exe');
const libvlcRoot = path.join(spikeRoot, '.deps', 'libvlc');
const dll = path.join(libvlcRoot, 'libvlc.dll');
const rawPath = path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json');
const nativeAvailable = [exactExecutable, playbackExecutable, dll, rawPath].every(existsSync);

describe.skipIf(!nativeAvailable)('hybrid control handoff', () => {
  it('can seek to an exact frame and start playback before the first explicit play', async () => {
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const target = raw.results.find((result: { id: string }) => result.id === 'fixture-cfr-ffv1');
    const playback = new LibVlcPlaybackAdapter(new NativeProcessClient({
      executable: playbackExecutable,
      args: [dll],
      env: {
        ...process.env,
        PATH: `${libvlcRoot};${process.env.PATH}`,
        VLC_PLUGIN_PATH: path.join(libvlcRoot, 'plugins'),
      },
    }));
    const exact = new BestSourceFramePlaybackAdapter(new NativeProcessClient({
      executable: exactExecutable,
      env: nativeEnvironment(),
    }));
    const hybrid = new HybridFramePlaybackAdapter(playback, exact);

    hybrid.setPlaybackFrameListener((frame) => void playback.acknowledgeFrame(frame.frameGeneration));
    try {
      const prepared = {
        playbackSourcePath: target.sourcePath,
        reviewAssetPath: target.reviewAsset,
        indexPath: target.index,
        previewBounds: { maxWidth: 320, maxHeight: 180 },
      };
      await hybrid.openPlaybackSource(target.sourcePath, prepared.previewBounds);
      await hybrid.enableExactReview(prepared);
      const exactFrame = await hybrid.scrubToFrame(20);
      const resumed = nextFrame(playback);

      await hybrid.play();
      const playbackFrame = await resumed;

      expect(abs(playbackFrame.playbackTimestampUs - sourceFrameTimeUs(exactFrame.identity))).toBeLessThan(200_000n);
      await playback.acknowledgeFrame(playbackFrame.frameGeneration);
    } finally {
      await hybrid.shutdown();
    }
  }, 30_000);

  it.each(['fixture-cfr-ffv1', 'fixture-vfr-ffv1', 'media-005'])(
    'reopens and moves repeatedly between LibVLC playback and exact BestSource review for %s', async (targetId) => {
      const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
      const target = raw.results.find((result: { id: string }) => result.id === targetId);
      const playback = new LibVlcPlaybackAdapter(new NativeProcessClient({
        executable: playbackExecutable,
        args: [dll],
        env: {
          ...process.env,
          PATH: `${libvlcRoot};${process.env.PATH}`,
          VLC_PLUGIN_PATH: path.join(libvlcRoot, 'plugins'),
        },
      }));
      const exact = new BestSourceFramePlaybackAdapter(new NativeProcessClient({
        executable: exactExecutable,
        env: nativeEnvironment(),
      }));
      const hybrid = new HybridFramePlaybackAdapter(playback, exact);

      hybrid.setPlaybackFrameListener((frame) => void playback.acknowledgeFrame(frame.frameGeneration));
      try {
        const prepared = {
          playbackSourcePath: target.sourcePath,
          reviewAssetPath: target.reviewAsset,
          indexPath: target.index,
          previewBounds: { maxWidth: 320, maxHeight: 180 },
        };
        await hybrid.openPlaybackSource(target.sourcePath, prepared.previewBounds);
        await hybrid.primePreview();
        await hybrid.enableExactReview(prepared);
        await hybrid.close();
        await hybrid.openPlaybackSource(target.sourcePath, prepared.previewBounds);
        await hybrid.primePreview();
        const exactStatus = await hybrid.enableExactReview(prepared);

        for (let pass = 0; pass < 3; ++pass) {
          await hybrid.play();
          await delay(150);
          const landed = await hybrid.enterExactAtCurrentPlaybackTime();
          expect(landed.identity.frameIndex).toBeGreaterThanOrEqual(0);
          expect(landed.identity.frameIndex).toBeLessThan(exactStatus.numFrames ?? 0);
          const stepped = await hybrid.stepFrames(1, 7);
          expect(stepped.identity.frameIndex).toBeGreaterThanOrEqual(landed.identity.frameIndex);

          const resumed = nextFrame(playback);
          await hybrid.play();
          const playbackFrame = await resumed;
          if (targetId.startsWith('fixture-')) {
            expect(abs(playbackFrame.playbackTimestampUs - sourceFrameTimeUs(stepped.identity))).toBeLessThan(200_000n);
          } else {
            // LibVLC's watch-time and display callbacks are not frame-synchronized on real media.
            expect(abs(playbackFrame.playbackTimestampUs - sourceFrameTimeUs(stepped.identity))).toBeLessThan(1_000_000n);
          }
          await playback.acknowledgeFrame(playbackFrame.frameGeneration);
        }
      } finally {
        await hybrid.shutdown();
      }
    }, 60_000);
});

function nextFrame(playback: LibVlcPlaybackAdapter): Promise<PlaybackDisplayFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for resumed playback frame.')), 10_000);
    playback.setFrameListener((frame) => {
      clearTimeout(timer);
      resolve(frame);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function abs(value: bigint): bigint { return value < 0n ? -value : value; }

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
