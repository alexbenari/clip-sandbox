// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

import {
  enterMovieFullScreen, leaveMovieFullScreen, lockExactRange, stageExactDraft, withFreshApp,
} from './support/app.js';

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

const withMovieOpen = (profilePrefix, run) => withFreshApp(profilePrefix, run, { movie });
const playPause = page => page.locator('.frame-review-player [data-command="play-pause"]');
const lockedRange = page => page.locator('[data-range-id="range-1"]');

test('an exact draft plays, jumps to its ends, loops, pauses, resumes, and X locks it and stops the loop', async () => {
  await withMovieOpen('clip-exact-draft-', async page => {
    const identity = page.locator('.frame-review-identity');
    await stageExactDraft(page, 5, 30);

    await page.keyboard.press('Space');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('a');
    await expect(identity).toHaveText('Frame 5');
    await page.keyboard.press('s');
    await expect(identity).toHaveText('Frame 30');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'false');
    await page.keyboard.press('z');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('Space');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'false');
    await page.keyboard.press('Space');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');
    await page.keyboard.press('x');

    await expect(lockedRange(page)).toHaveCount(1);
    await expect(playPause(page)).toHaveAttribute('data-playing', 'false');
  });
});

test('a draft loop keeps running through entering and leaving movie full screen', async () => {
  await withMovieOpen('clip-exact-loop-fs-', async page => {
    const currentTime = page.locator('.frame-review-player [data-time="current"]');
    await stageExactDraft(page, 5, 30);
    await page.keyboard.press('z');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');

    await enterMovieFullScreen(page, () => page.keyboard.press('f'));
    await leaveMovieFullScreen(page, () => page.keyboard.press('f'));

    const timeAfterLeaving = await currentTime.textContent();
    await expect(currentTime).not.toHaveText(timeAfterLeaving!);
  });
});

test('Refine Gif puts keyboard focus on the movie player', async () => {
  await withMovieOpen('clip-exact-refine-focus-', async page => {
    await lockExactRange(page, 5, 30);

    await lockedRange(page).locator('[data-refine-range]').click();

    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('.frame-review-player')).toBeFocused();
  });
});

test('Refine Gif shows the movie player from GIF Extraction rather than a second one', async () => {
  await withMovieOpen('clip-exact-refine-player-', async page => {
    await lockExactRange(page, 5, 30);
    const playerBeforeRefine = await page.locator('.frame-review-player').elementHandle();

    await lockedRange(page).locator('[data-refine-range]').click();

    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('#mainScreenHost input[type="range"]')).toHaveCount(1);
    expect(await playerBeforeRefine!.evaluate(player => document.querySelector('.frame-review-player') === player)).toBe(true);
  });
});

test('F enters and leaves movie full screen on Refine Gif and stays on Refine Gif', async () => {
  await withMovieOpen('clip-exact-refine-fs-', async page => {
    await lockExactRange(page, 5, 30);
    await lockedRange(page).locator('[data-refine-range]').click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();

    await enterMovieFullScreen(page, () => page.keyboard.press('f'));
    await leaveMovieFullScreen(page, () => page.keyboard.press('f'));

    await expect(page.locator('#refineGifScreen')).toBeVisible();
  });
});

test('a range refined during its loop locks with X, and Back shows its new frames on GIF Extraction', async () => {
  await withMovieOpen('clip-exact-refine-lock-', async page => {
    await lockExactRange(page, 5, 30);
    await lockedRange(page).locator('[data-refine-range]').click();
    await stageExactDraft(page, 7, 29);
    await page.keyboard.press('z');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');

    await page.keyboard.press('x');
    await expect(page.locator('#refineGifScreen')).toContainText('Exact range locked');
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();

    await expect(lockedRange(page)).toContainText('frame 7');
    await expect(lockedRange(page)).toContainText('frame 29');
  });
});

test('switching to another screen stops a running range loop', async () => {
  await withMovieOpen('clip-exact-loop-screen-', async page => {
    await lockExactRange(page, 5, 30);
    await lockedRange(page).click();
    await page.keyboard.press('z');
    await expect(playPause(page)).toHaveAttribute('data-playing', 'true');

    await page.locator('#appScreenSelector').selectOption('collection');
    await page.locator('#appScreenSelector').selectOption('gif-extraction');

    await expect(playPause(page)).toHaveAttribute('data-playing', 'false');
  });
});
