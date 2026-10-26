import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';

import { generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason } from '../support/frame-review-dependencies.js';
import { launchApp, lockExactRange, openMovieForExactReview, resizeContent, seekToFrame, visibleBox } from './support/app.js';

const movie = generatedMovieFixture('cfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(
  path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), path.join(nativeBinaryFolder, 'libvlc_media_service.exe'), movie);

test.skip(unavailable !== null, unavailable ?? '');

const windowSizes = [{ width: 1440, height: 900 }, { width: 900, height: 700 }] as const;

async function expectFullyVisible(locators: Locator, description: string): Promise<void> {
  const all = await locators.all();
  expect(all.length, `${description}: nothing matched`).toBeGreaterThan(0);
  for (const locator of all) {
    const label = (await locator.innerText()).replace(/\s+/g, ' ').trim();
    await expect(locator, `${description}: ${label}`).toBeInViewport({ ratio: 1 });
  }
}

async function expectPlayerFullyVisible(page: Page, size: string): Promise<void> {
  const player = page.locator('.frame-review-player');
  await expectFullyVisible(player.locator('.frame-review-viewport'), `movie picture at ${size}`);
  await expectFullyVisible(player.locator('.frame-review-transport button:visible'), `transport at ${size}`);
}

async function withTwoCapturedRanges(run: (app: ElectronApplication, page: Page) => Promise<void>): Promise<void> {
  test.setTimeout(150_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-layout-'));
  const app = await launchApp(path.join(directory, 'profile'));
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, movie);
    await lockExactRange(page, 5, 15);
    await lockExactRange(page, 30, 45);
    await expect(page.locator('[data-range-id="range-2"]')).toHaveCount(1);
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await run(app, page);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('GIF Extraction shows the player and every capture control without scrolling', async () => {
  await withTwoCapturedRanges(async (app, page) => {
    for (const { width, height } of windowSizes) {
      await resizeContent(app, page, width, height);

      await expectPlayerFullyVisible(page, `${width}x${height}`);
      await expectFullyVisible(page.locator('#gifExtractionScreen .gif-capture-controls button'), `capture control at ${width}x${height}`);
    }
  });
});

test('Refine Gif shows the player and the whole workbench below it without scrolling', async () => {
  await withTwoCapturedRanges(async (app, page) => {
    await page.locator('[data-range-id="range-1"] [data-refine-range]').click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await seekToFrame(page, 7);
    await page.keyboard.press('q');
    await expect(page.locator('#refineGifScreen [data-refine-start-value]')).toHaveText('Frame 7');
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    const workbench = page.locator('#refineGifScreen .gif-refinement-workbench');

    for (const { width, height } of windowSizes) {
      await resizeContent(app, page, width, height);

      await expectPlayerFullyVisible(page, `${width}x${height}`);
      const transport = await visibleBox(page.locator('.frame-review-transport'));
      expect((await visibleBox(workbench)).y, `workbench sits below the player at ${width}x${height}`)
        .toBeGreaterThanOrEqual(transport.y + transport.height);
      await expectFullyVisible(workbench.locator('.gif-refinement-endpoint'), `endpoint at ${width}x${height}`);
      await expectFullyVisible(workbench.locator('.gif-refinement-actions button:visible'), `workbench action at ${width}x${height}`);
      await expectFullyVisible(workbench.getByRole('status'), `workbench hint at ${width}x${height}`);
    }
  });
});
