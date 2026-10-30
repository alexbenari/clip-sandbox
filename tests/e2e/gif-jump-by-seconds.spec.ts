import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import {
  generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason, projectFolder, readFrameReviewDependencies,
  toolEnvironment,
} from '../support/frame-review-dependencies.js';
import { launchApp, openMovieForExactReview, seekToFrame } from './support/app.js';
import { runTool } from './support/media-tools.js';

const vfrMovie = generatedMovieFixture('vfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), vfrMovie);

test.skip(unavailable !== null, unavailable ?? '');

const FRAMES_PER_SECOND = 10;
const MOVIE_SECONDS = 18;

test('top-row digits jump playback forward by 1, 2, 5, 7 and 10 seconds of the real movie', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-jump-seconds-'));
  const app = await launchApp(path.join(directory, 'profile'));
  try {
    const movie = await createCountingMovie(directory);
    const page = await app.firstWindow();
    await installPaintProbe(page);
    await openMovieForExactReview(page, movie);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');

    for (const [key, seconds] of [['1', 1], ['2', 2], ['3', 5], ['4', 7], ['5', 10]] as const) {
      await seekPlaybackToStart(page);
      await expectPlaybackJump(page, () => page.keyboard.press(key), seconds);
    }
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('variable-frame-rate scrub jumps resolve by time and clamp to indexed endpoints', async () => {
  test.setTimeout(90_000);
  const fixture = vfrFixture();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-jump-vfr-'));
  const app = await launchApp(path.join(directory, 'profile'));
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, vfrMovie);

    await seekToFrame(page, fixture.startFrame);
    await page.getByRole('combobox', { name: 'Jump by seconds' }).selectOption('2');
    await page.locator('[data-command="jump-seconds"]').click();
    await expectTimeWithin(page, fixture.startFrameSeconds + 2, 0.15);

    await page.keyboard.press('5');
    await expect(page.locator('.frame-review-identity')).toHaveText(`Frame ${fixture.lastFrame}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('5');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 0');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function vfrFixture(): { startFrame: number; startFrameSeconds: number; lastFrame: number } {
  const manifest = JSON.parse(readFileSync(path.join(projectFolder, 'tests', 'fixtures', 'gif-extraction', 'manifest.json'), 'utf8')
    .replace(/^\uFEFF/, ''));
  const vfr = manifest.fixtures.find((fixture: { id: string }) => fixture.id === 'vfr-audio');
  return {
    startFrame: vfr.selectedRange.startFrame,
    startFrameSeconds: Number(vfr.expected.sourceStartTime),
    lastFrame: vfr.expected.reviewFrameCount - 1,
  };
}

async function createCountingMovie(directory: string): Promise<string> {
  const dependencies = readFrameReviewDependencies();
  const movie = path.join(directory, 'jump-source.mkv');
  const rawVideo = path.join(directory, 'jump-source.rgb');
  const rawAudio = path.join(directory, 'jump-source.pcm');
  const frameBytes = 160 * 90 * 3;
  const frames = MOVIE_SECONDS * FRAMES_PER_SECOND;
  const pixels = Buffer.alloc(frameBytes * frames);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let offset = frame * frameBytes; offset < (frame + 1) * frameBytes; offset += 3) {
      pixels[offset] = frame % 256;
      pixels[offset + 1] = (frame * 3) % 256;
      pixels[offset + 2] = (frame * 7) % 256;
    }
  }
  await Promise.all([fs.writeFile(rawVideo, pixels), fs.writeFile(rawAudio, Buffer.alloc(MOVIE_SECONDS * 48_000 * 2 * 2))]);
  await runTool(dependencies.ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '160x90', '-framerate', String(FRAMES_PER_SECOND), '-i', rawVideo,
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
    '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'aac', '-shortest', movie,
  ], toolEnvironment(dependencies));
  return movie;
}

type PaintProbeWindow = Window & {
  __paintedPlaybackUs?: number;
  __clipSandboxFrameReviewPaintProbe?: { painted(frame: { kind: string; playbackTimestampUs?: bigint }): void };
};

async function installPaintProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as PaintProbeWindow;
    win.__clipSandboxFrameReviewPaintProbe = {
      painted: frame => {
        if (frame.kind === 'playback-frame' && frame.playbackTimestampUs !== undefined) win.__paintedPlaybackUs = Number(frame.playbackTimestampUs);
      },
    };
  });
}

async function paintedSeconds(page: Page): Promise<number | null> {
  const microseconds = await page.evaluate(() => (window as PaintProbeWindow).__paintedPlaybackUs);
  return microseconds === undefined ? null : microseconds / 1_000_000;
}

async function expectPlaybackJump(page: Page, act: () => Promise<void>, seconds: number): Promise<void> {
  const before = await paintedSeconds(page);
  expect(before, 'a playback frame was painted before the jump').not.toBeNull();
  const pressedAt = Date.now();
  await act();
  await expect.poll(async () => {
    const painted = await paintedSeconds(page);
    // Playback keeps running during the jump, so it may land later by the time that has passed.
    const elapsed = (Date.now() - pressedAt) / 1000;
    const earliest = before! + seconds - 0.25;
    const latest = before! + seconds + elapsed + 0.25;
    return painted !== null && painted >= earliest && painted <= latest ? 'landed' : `painted ${painted}, expected ${earliest}..${latest}`;
  }, { timeout: 5_000 }).toBe('landed');
}

async function seekPlaybackToStart(page: Page): Promise<void> {
  await page.locator('.frame-review-progress-row input').evaluate(element => {
    const input = element as HTMLInputElement;
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await paintedSeconds(page)) ?? Number.POSITIVE_INFINITY, { timeout: 5_000 }).toBeLessThan(1);
}

async function expectTimeWithin(page: Page, seconds: number, tolerance: number): Promise<void> {
  await expect.poll(async () => {
    const fields = ((await page.locator('[data-time="current"]').textContent()) ?? '').split(':').map(Number);
    const current = fields.length === 3 ? fields[0] * 3600 + fields[1] * 60 + fields[2] : Number.NaN;
    return Math.abs(current - seconds);
  }, { timeout: 5_000 }).toBeLessThan(tolerance);
}

