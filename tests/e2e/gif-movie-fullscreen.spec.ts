import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';

import { generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason } from '../support/frame-review-dependencies.js';
import {
  enterMovieFullScreen, expectNoFullScreenRequest, launchApp, leaveMovieFullScreen, openMovieForExactReview, seekToFrame,
} from './support/app.js';

const movie = generatedMovieFixture('cfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'libvlc_media_service.exe'), movie);

test.skip(unavailable !== null, unavailable ?? '');

async function withApp(prefix: string, run: (page: Page) => Promise<void>, { openMovie = true } = {}): Promise<void> {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const app = await launchApp(path.join(directory, 'profile'));
  try {
    const page = await app.firstWindow();
    if (openMovie) await openMovieForExactReview(page, movie);
    await run(page);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** A point on the movie picture, well above the seek row at the bottom of the player. */
async function pointOnPicture(player: Locator, heightFraction: number): Promise<{ x: number; y: number }> {
  const box = (await player.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height * heightFraction };
}

test('F has no effect before a movie review session exists', async () => {
  await withApp('clip-movie-fs-empty-', async page => {
    const player = page.locator('.frame-review-player');
    await expect(player.getByRole('button', { name: 'Full screen' })).toBeDisabled();
    await player.focus();

    await expectNoFullScreenRequest(page, () => page.keyboard.press('f'));
  }, { openMovie: false });
});

test('F reviews the same frame at display size and F again restores the workspace', async () => {
  await withApp('clip-movie-fs-flow-', async page => {
    const player = page.locator('.frame-review-player');
    await page.locator('#foldClips').click();
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    // The fold animates the panel width, which can grow the player host at narrow windows.
    await expect.poll(() => page.locator('#clipsPanel').evaluate(panel => panel.getAnimations().length)).toBe(0);
    await seekToFrame(page, 10);
    const hostHeight = () => player.evaluate(element => element.parentElement!.getBoundingClientRect().height);
    const workspaceHeight = await hostHeight();

    await enterMovieFullScreen(page, async () => {
      await player.getByRole('button', { name: 'Full screen' }).focus();
      await page.keyboard.press('f');
    });

    await expect(player).toBeFocused();
    await expect(player.locator('.frame-review-progress-row input')).toHaveValue('10');
    const playerBox = (await player.boundingBox())!;
    expect({ width: playerBox.width, height: playerBox.height })
      .toEqual(await page.evaluate(() => ({ width: screen.width, height: screen.height })));
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(player.locator('.frame-review-transport')).toBeHidden();

    await leaveMovieFullScreen(page, () => page.keyboard.press('f'));

    await expect(player).toBeFocused();
    await expect(player.locator('.frame-review-identity')).toHaveText('Frame 10');
    await expect.poll(hostHeight).toBeCloseTo(workspaceHeight, 0);
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    await expect(page.locator('#foldClips')).toHaveAttribute('aria-expanded', 'false');
  });
});

test('in movie full screen the seek row hides when idle, returns on pointer movement, and a click does not start playback', async () => {
  await withApp('clip-movie-fs-overlay-', async page => {
    const player = page.locator('.frame-review-player');
    const row = player.locator('.frame-review-progress-row');
    await enterMovieFullScreen(page, () => player.getByRole('button', { name: 'Full screen' }).click());
    const upperPicture = await pointOnPicture(player, 0.25);
    const lowerPicture = await pointOnPicture(player, 0.5);

    await page.mouse.move(upperPicture.x, upperPicture.y);
    await expect(row).toHaveCSS('opacity', '1');
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });

    await page.mouse.click(lowerPicture.x, lowerPicture.y);
    await expect(row).toHaveCSS('opacity', '1');
    await expect(player.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });
  });
});

test('dragging the seek row in movie full screen moves to the frame and returns focus to the player', async () => {
  await withApp('clip-movie-fs-drag-', async page => {
    const player = page.locator('.frame-review-player');
    const row = player.locator('.frame-review-progress-row');
    await enterMovieFullScreen(page, () => player.getByRole('button', { name: 'Full screen' }).click());
    const bar = (await row.locator('input').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * 0.25, bar.y + bar.height / 2);
    await page.mouse.down();

    await seekToFrame(page, 20);
    await page.mouse.up();

    await expect(player).toBeFocused();
    const picture = await pointOnPicture(player, 0.25);
    await page.mouse.move(picture.x, picture.y);
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });
  });
});

// That entering full screen closes Activity is proven in full-screen-change-workflow.spec.ts: here any
// click or focus that could start full screen already closes Activity, and on a small display the
// open panel covers the Full screen button.
test('F works from the Jump-by selector, the keyboard map lists the full-screen keys, and Escape exits', async () => {
  await withApp('clip-movie-fs-keys-', async page => {
    const player = page.locator('.frame-review-player');
    await player.getByRole('combobox', { name: 'Jump by seconds' }).focus();
    await enterMovieFullScreen(page, () => page.keyboard.press('f'));
    await expect(player).toBeFocused();
    await leaveMovieFullScreen(page, () => page.keyboard.press('f'));
    await expect(player).toBeFocused();

    await page.locator('#keyboardMapBtn').click();
    await expect(page.locator('#keyboardMapPanel')).toContainText('Enter or exit movie full screen');
    await expect(page.locator('#keyboardMapPanel')).toContainText('Exit movie full screen');
    await page.keyboard.press('Escape');
    await expect(page.locator('#keyboardMapPanel')).toBeHidden();

    await enterMovieFullScreen(page, () => player.getByRole('button', { name: 'Full screen' }).click());
    await expect(player).toBeFocused();

    await leaveMovieFullScreen(page, () => page.keyboard.press('Escape'));
    await expect(player).toBeFocused();
  });
});
