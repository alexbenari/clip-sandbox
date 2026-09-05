import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PlaybackDisplayFrame } from '../../src/adapter/frame-playback-adapter.js';
import { LibVlcPlaybackAdapter } from '../../src/adapter/libvlc-playback-adapter.js';
import { NativeProcessClient } from '../../src/adapter/native-process-client.js';

const spikeRoot = path.resolve(import.meta.dirname, '..', '..');
const executable = path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_media_service.exe');
const libvlcRoot = path.join(spikeRoot, '.deps', 'libvlc');
const dll = path.join(libvlcRoot, 'libvlc.dll');
const rawPath = path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json');
const nativeAvailable = [executable, dll, rawPath].every(existsSync);

describe.skipIf(!nativeAvailable)('LibVLC media service', () => {
  it.each(['fixture-cfr-ffv1', 'media-005'])(
    'streams playback frames and accepts transport commands for %s', async (targetId) => {
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const target = raw.results.find((result: { id: string }) => result.id === targetId);
    const playback = new LibVlcPlaybackAdapter(new NativeProcessClient({
      executable,
      args: [dll],
      env: { ...process.env, PATH: `${libvlcRoot};${process.env.PATH}`, VLC_PLUGIN_PATH: path.join(libvlcRoot, 'plugins') },
    }));

    try {
      await expect(playback.open(target.sourcePath, {
        previewBounds: { maxWidth: 640, maxHeight: 360 },
      })).resolves.toMatchObject({ state: 'playback-ready' });
      const framePromise = new Promise<PlaybackDisplayFrame>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for a playback frame.')), 10_000);
        let first = true;
        playback.setFrameListener((frame) => {
          if (!first) {
            void playback.acknowledgeFrame(frame.frameGeneration);
            return;
          }
          first = false;
          clearTimeout(timer);
          resolve(frame);
        });
      });
      await playback.play();
      const frame = await framePromise;
      expect(frame.stride).toBeGreaterThanOrEqual(frame.width * 4);
      expect(frame.pixels.byteLength).toBe(frame.stride * frame.height);
      expect(frame.pixelFormat).toBe('RGBA8888');
      expect(frame.frameGeneration).toBeGreaterThan(0);
      if (targetId === 'fixture-cfr-ffv1') {
        expect({ width: frame.width, height: frame.height }).toEqual({ width: 320, height: 180 });
        expect({ width: frame.sourceWidth, height: frame.sourceHeight }).toEqual({ width: 320, height: 180 });
      }
      if (targetId === 'media-005') {
        expect(frame.width).toBeLessThanOrEqual(640);
        expect(frame.height).toBeLessThanOrEqual(360);
        expect(frame.width).toBeGreaterThan(600);
        expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(0.01);
        expect({ width: frame.sourceWidth, height: frame.sourceHeight }).toEqual({ width: 1920, height: 1080 });
      }
      for (let offset = 3; offset < frame.pixels.byteLength; offset += Math.max(4, frame.width * 16)) {
        expect(frame.pixels[offset]).toBe(255);
      }
      await playback.acknowledgeFrame(frame.frameGeneration);
      await playback.pause();
      for (const rate of [0.25, 0.5, 1, 2]) await playback.setRate(rate);
      await playback.seekTimeUs(1_000_000n);
      const soughtFramePromise = nextFrame(playback);
      await playback.play();
      const soughtFrame = await soughtFramePromise;
      await playback.acknowledgeFrame(soughtFrame.frameGeneration);
      if (targetId === 'fixture-cfr-ffv1') {
        expect(abs(soughtFrame.playbackTimestampUs - 1_000_000n)).toBeLessThan(150_000n);
      }
      await playback.pause();
      await playback.stop();
    } finally {
      await playback.shutdown();
    }
  }, 30_000);
});

function abs(value: bigint): bigint { return value < 0n ? -value : value; }

function nextFrame(playback: LibVlcPlaybackAdapter): Promise<PlaybackDisplayFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for a sought playback frame.')), 10_000);
    playback.setFrameListener((frame) => {
      clearTimeout(timer);
      playback.setFrameListener(undefined);
      resolve(frame);
    });
  });
}
