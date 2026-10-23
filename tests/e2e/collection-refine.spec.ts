import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import { generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason } from '../support/frame-review-dependencies.js';
import {
  chooseNextFolder, enterMovieFullScreen, launchApp, leaveMovieFullScreen, lockExactRange, openMovieForExactReview,
  seekToFrame, writeAppSettings,
} from './support/app.js';

const fixture = generatedMovieFixture('cfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), fixture);

test.skip(unavailable !== null, unavailable ?? '');

async function refineFromContextMenu(page: Page, clipName: string): Promise<void> {
  const clip = page.locator(`#grid .thumb[data-name="${clipName}"]`);
  await expect(clip).toBeVisible();
  await clip.click({ button: 'right' });
  const refine = page.locator('#clipContextMenu [data-item-id="refine-clip"]');
  await expect(refine).toBeEnabled();
  await refine.click();
  await expect(page.locator('#appScreenSelector')).toHaveValue('collection-refine');
  await expect(page.locator('#collection-refineScreen [data-refine-range-title]')).toContainText('Range 1', { timeout: 90_000 });
}

/** Back is refused while the refined clip is still being saved, so retry until the Collection screen shows. */
async function backToCollection(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Back to Collection' }).click();
    await expect(page.locator('#appScreenSelector')).toHaveValue('collection', { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test('refines an extracted collection clip from its original movie and adds a new clip to that collection', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-collection-refine-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  const source = path.join(directory, 'source.mkv');
  await fs.copyFile(fixture, source);
  await writeAppSettings(profile, { version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false });
  const app = await launchApp(profile);
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, source);
    await lockExactRange(page, 3, 5);
    await page.getByRole('button', { name: 'Extract all (1)' }).click();
    await expect(page.locator('[data-range-id="range-1"]')).toContainText('Extracted as source-001.mp4', { timeout: 90_000 });
    const captureDirectory = path.join(profile, 'clip-captures');
    const captureFilename = (await fs.readdir(captureDirectory)).find(name => name.endsWith('.json'));
    expect(captureFilename).toBeDefined();
    const capturePath = path.join(captureDirectory, captureFilename!);
    await expect.poll(async () => JSON.parse(await fs.readFile(capturePath, 'utf8')).ranges.length).toBe(0);
    const savedCapturesBeforeRefine = await fs.readFile(capturePath, 'utf8');

    // Refining from the pipeline view publishes a new clip without adding it to any collection.
    const collectionFolder = path.join(pipelines, 'extraction-tmp');
    await page.locator('#appScreenSelector').selectOption('collection');
    await chooseNextFolder(page, collectionFolder);
    await page.locator('#pickBtn').click();
    await refineFromContextMenu(page, 'source-001.mp4');
    await enterMovieFullScreen(page, () => page.keyboard.press('f'));
    await leaveMovieFullScreen(page, () => page.keyboard.press('f'));
    await page.keyboard.press('x');
    await page.locator('#collection-refineScreen [data-command="extract-current"]').click();
    await expect.poll(() => existsSync(path.join(collectionFolder, 'source-002.mp4')), { timeout: 90_000 }).toBe(true);
    await backToCollection(page);
    await expect(page.locator('#grid .thumb[data-name="source-002.mp4"]')).toBeVisible();
    expect(await fs.readFile(path.join(collectionFolder, 'source.txt'), 'utf8')).toBe('source-001.mp4\n');

    // Refining from a collection view adds the revised clip to that collection, and the movie's captures stay as they were.
    await page.locator('#activeCollectionName').selectOption('source.txt');
    await refineFromContextMenu(page, 'source-001.mp4');
    await expect(page.locator('[aria-label="Refined collection clip"] [data-extract-range]')).toBeDisabled();
    await seekToFrame(page, 6);
    await page.keyboard.press('w');
    await page.keyboard.press('x');
    await expect(page.locator('#collection-refineScreen [data-command="loop-range"]')).toBeEnabled();
    await page.keyboard.press('a');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 3');
    await page.keyboard.press('s');
    await expect(page.locator('.frame-review-identity')).toHaveText('Frame 6');
    await page.locator('[aria-label="Refined collection clip"] [data-refine-range="range-1"]').click();
    await expect(page.locator('#collection-refineScreen [data-command="lock-refinement"]')).toBeEnabled();
    await page.keyboard.press('x');
    await expect(page.locator('#collection-refineScreen [data-command="extract-current"]')).toBeEnabled();
    await page.keyboard.press('e');
    await expect.poll(async () => fs.readFile(path.join(collectionFolder, 'source.txt'), 'utf8'), { timeout: 90_000 })
      .toBe('source-001.mp4\nsource-003.mp4\n');
    expect(existsSync(path.join(collectionFolder, 'source-003.mp4'))).toBe(true);
    expect(await fs.readFile(capturePath, 'utf8')).toBe(savedCapturesBeforeRefine);
    await backToCollection(page);
    await expect(page.locator('#grid .thumb[data-name="source-003.mp4"]')).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
