// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

import { seekToFrame } from './support/app.js';

const project = path.resolve('.');
const movie = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'libvlc_media_service.exe');

test.skip(process.platform !== 'win32' || !existsSync(movie) || !existsSync(nativeService),
  'The explicit frame-review native build and movie fixture are not available.');

test('movie scrollbar paints the chosen position while the mouse is still down', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-held-scrollbar-'));
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() => {
      window.__scrollbarPaintTimes = [];
      window.__clipSandboxFrameReviewPaintProbe = {
        painted: frame => {
          if (frame.kind === 'playback-frame') window.__scrollbarPaintTimes.push(Number(frame.playbackTimestampUs));
        },
      };
    });
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie…' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const progress = page.locator('.frame-review-progress-row input');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');

    const box = await progress.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    const duration = (await page.locator('.frame-review-progress-row [data-time="duration"]').textContent()).split(':');
    const targetUs = (Number(duration[0]) * 3600 + Number(duration[1]) * 60 + Number(duration[2])) * 750_000;
    await page.evaluate(() => { window.__scrollbarPaintTimes = []; });
    await progress.evaluate(input => {
      input.value = String(Math.round(Number(input.max) * 0.75));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect.poll(async () => page.evaluate(target => window.__scrollbarPaintTimes.some(time => Math.abs(time - target) < 500_000), targetUs))
      .toBe(true);
    expect(await progress.evaluate(input => Number(input.value) / Number(input.max))).toBeCloseTo(0.75, 2);
    await page.mouse.up();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('exact draft jumps, loops, pauses to scrub, resumes, and locks with X', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-exact-preview-'));
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie…' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    await seekToFrame(page, 5);
    await page.keyboard.press('q');
    await seekToFrame(page, 30);
    await page.keyboard.press('w');

    const jumpStart = page.locator('#gifExtractionScreen [data-command="jump-start"]');
    const jumpEnd = page.locator('#gifExtractionScreen [data-command="jump-end"]');
    const loop = page.locator('#gifExtractionScreen [data-command="loop-range"]');
    await expect(jumpStart).toBeEnabled();
    await expect(jumpEnd).toBeEnabled();
    await expect(loop).toBeEnabled();
    await page.keyboard.press('Space');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await expect(loop).toBeDisabled();
    await page.keyboard.press('z');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('a');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 5');
    await page.keyboard.press('s');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 30');

    await page.keyboard.press('z');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await expect(page.locator('#gifExtractionScreen [data-command="mark-start"]')).toBeDisabled();
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('Space');
    await expect(page.locator('.frame-review-identity')).toHaveText(/^Frame \d+$/);
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
    await page.keyboard.press('Space');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('x');
    await expect(page.locator('[data-range-id="range-1"]')).toHaveCount(1);
    await expect(page.locator('#gifExtractionScreen [data-command="lock-range"]')).toBeDisabled();
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');

    const locked = page.locator('[data-range-id="range-1"]');
    await locked.click();
    await expect(loop).toBeEnabled();
    await page.keyboard.press('z');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await expect(page.locator('#gifExtractionScreen [data-command="lock-range"]')).toBeDisabled();
    await expect(locked.locator('[data-extract-range]')).toBeDisabled();
    await page.keyboard.press('Space');
    const playerBeforeRefine = await page.locator('.frame-review-player').elementHandle();
    await locked.locator('[data-refine-range]').click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    // With a movie open, Refine Gif puts keyboard focus on the player so capture keys work at once.
    await expect(page.locator('.frame-review-player')).toBeFocused();
    await expect(page.locator('#appScreenSelector option:checked')).toHaveText('Refine Gif');
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).toHaveClass(/folded/);
    // Refine Gif shows the same movie player rather than a second one.
    await expect(page.locator('#mainScreenHost input[type="range"]')).toHaveCount(1);
    expect(await playerBeforeRefine!.evaluate(player => document.querySelector('.frame-review-player') === player)).toBe(true);
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await seekToFrame(page, 7);
    await page.keyboard.press('q');
    await seekToFrame(page, 29);
    await page.keyboard.press('w');
    await expect(page.locator('#refineGifScreen [data-command="loop-range"]')).toBeEnabled();
    await page.keyboard.press('z');
    await expect(page.locator('#refineGifScreen [data-command="extract-current"]')).toBeDisabled();
    await page.keyboard.press('x');
    await expect(page.locator('#refineGifScreen')).toContainText('Exact range locked');
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(page.locator('#appScreenSelector option', { hasText: 'Refine Gif' })).toHaveCount(0);
    await expect(locked).toContainText('frame 7');
    await expect(locked).toContainText('frame 29');
    await page.keyboard.press('z');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
    await page.locator('#appScreenSelector').selectOption('collection');
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('.frame-review-player [data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

