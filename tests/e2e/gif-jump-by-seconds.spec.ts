import { spawn } from 'node:child_process';
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

const vfrMovie = generatedMovieFixture('vfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), vfrMovie);

test.skip(unavailable !== null, unavailable ?? '');

const FRAMES_PER_SECOND = 10;
const MOVIE_SECONDS = 18;

test('top-row and visible jumps use elapsed seconds in playback and directional exact scrub', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-jump-seconds-'));
  const app = await launchApp(path.join(directory, 'profile'));
  try {
    const movie = await createCountingMovie(directory);
    const page = await app.firstWindow();
    await installPaintProbe(page);
    await openMovieForExactReview(page, movie);
    const selector = page.getByRole('combobox', { name: 'Jump by seconds' });
    const jump = page.locator('[data-command="jump-seconds"]');
    await expect(selector).toHaveValue('2');
    await expect(jump).toHaveText('Jump +2s');
    await expect(jump).toBeEnabled();

    // Top-row digits 1-5 jump 1, 2, 5, 7 and 10 seconds forward from wherever playback is.
    await page.keyboard.press('1');
    await expectTimeNear(page, 1);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    for (const [key, seconds] of [['2', 2], ['3', 5], ['4', 7], ['5', 10]] as const) {
      await seekPlaybackToStart(page);
      await expectPlaybackJump(page, () => page.keyboard.press(key), seconds);
    }

    // Paused at an exact frame, jumps resolve by elapsed time in the last stepped direction.
    await page.keyboard.press('Space');
    await expect(page.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
    await seekToFrame(page, 120);
    await page.keyboard.press('ArrowLeft');
    await expect(jump).toHaveText('Jump −2s');
    await page.keyboard.press('3');
    await expectTimeNear(page, 11.9 - 5);
    await selector.selectOption('2');
    await jump.click();
    await expectTimeNear(page, 11.9 - 5 - 2);
    await expect(page.locator('.frame-review-identity')).toHaveText(/^Frame \d+$/);

    // A backward jump past the start stops at the first frame; stepping right turns jumps forward again.
    await page.keyboard.press('5');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 0');
    await page.keyboard.press('ArrowRight');
    await expect(jump).toHaveText('Jump +2s');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 1');

    // Refine Gif keeps the chosen jump length.
    await seekToFrame(page, 20);
    await page.keyboard.press('q');
    await seekToFrame(page, 60);
    await page.keyboard.press('w');
    await page.keyboard.press('x');
    const captured = page.locator('[data-range-id="range-1"]');
    await expect(captured).toHaveCount(1);
    await captured.locator('[data-refine-range]').click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(selector).toHaveValue('2');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 20');
    await page.keyboard.press('2');
    await expectTimeNear(page, 2 + 2);
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

/** Reads the variable-frame-rate fixture's known frame times from the fixture manifest. */
function vfrFixture(): { startFrame: number; startFrameSeconds: number; lastFrame: number } {
  const manifest = JSON.parse(readFileSync(path.join(projectFolder, 'tests', 'fixtures', 'gif-extraction', 'manifest.json'), 'utf8')
    .replace(/^﻿/, ''));
  const vfr = manifest.fixtures.find((fixture: { id: string }) => fixture.id === 'vfr-audio');
  return {
    startFrame: vfr.selectedRange.startFrame,
    startFrameSeconds: Number(vfr.expected.sourceStartTime),
    lastFrame: vfr.expected.reviewFrameCount - 1,
  };
}

/** An 18-second, 10 fps movie whose frames all differ, so every jump lands on a distinct frame. */
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
  await run(dependencies.ffmpeg.path, [
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

/** Records the timestamp of the latest playback frame the player actually painted. */
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

/**
 * Playback keeps running while a jump is in flight, so the painted time after the jump lies between
 * `before + seconds` and that plus the wall-clock time that has passed since the key press.
 */
async function expectPlaybackJump(page: Page, act: () => Promise<void>, seconds: number): Promise<void> {
  const before = await paintedSeconds(page);
  expect(before, 'a playback frame was painted before the jump').not.toBeNull();
  const pressedAt = Date.now();
  await act();
  await expect.poll(async () => {
    const painted = await paintedSeconds(page);
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

async function expectTimeNear(page: Page, seconds: number): Promise<void> {
  await expectTimeWithin(page, seconds, 0.15);
}

async function expectTimeWithin(page: Page, seconds: number, tolerance: number): Promise<void> {
  await expect.poll(async () => {
    const fields = ((await page.locator('[data-time="current"]').textContent()) ?? '').split(':').map(Number);
    const current = fields.length === 3 ? fields[0] * 3600 + fields[1] * 60 + fields[2] : Number.NaN;
    return Math.abs(current - seconds);
  }, { timeout: 5_000 }).toBeLessThan(tolerance);
}

function run(executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}
