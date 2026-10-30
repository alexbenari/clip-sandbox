import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';

import { generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason } from '../support/frame-review-dependencies.js';
import { chooseNextFolder, launchApp, lockExactRange, openMovieForExactReview, writeAppSettings } from './support/app.js';
import { runFfmpeg, streamKinds, videoFrameCount } from './support/media-tools.js';

const { Mp4Provenance } = createRequire(import.meta.url)('../../electron/clip-provenance/mp4-provenance.cjs');
// 72 frames at 24 frames per second, in a millisecond timebase, with sound.
const movieFixture = generatedMovieFixture('cfr-audio.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), movieFixture);

test.skip(unavailable !== null, unavailable ?? '');

type Workspace = Readonly<{ directory: string; profile: string; pipelines: string }>;

async function workspace(prefix: string): Promise<Workspace> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  await writeAppSettings(profile, { version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false });
  return { directory, profile, pipelines };
}

async function withApp(prefix: string, run: (page: Page, app: ElectronApplication, space: Workspace) => Promise<void>): Promise<void> {
  test.setTimeout(240_000);
  const space = await workspace(prefix);
  const app = await launchApp(space.profile);
  try {
    await run(await app.firstWindow(), app, space);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(space.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function openFolderInCollection(page: Page, folder: string, clipName: string): Promise<void> {
  await page.locator('#appScreenSelector').selectOption('collection');
  await chooseNextFolder(page, folder);
  await page.locator('#pickBtn').click();
  await expect(clipCard(page, clipName)).toBeVisible();
}

function clipCard(page: Page, name: string) {
  return page.locator(`#grid .thumb[data-name="${name}"]`);
}

function hintStatus(page: Page) {
  return page.locator('#zoomEditHint .zoom-edit-hint-status');
}

async function refine(page: Page, clipName: string): Promise<void> {
  await clipCard(page, clipName).click({ button: 'right' });
  await page.locator('#clipContextMenu [data-item-id="refine-clip"]').click();
  await expect(page.locator('#zoomEditHint')).toBeVisible();
}

async function pressKeys(page: Page, keys: readonly string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}

async function saveWith(page: Page, choice: 'Keep both' | 'Replace'): Promise<void> {
  await page.keyboard.press('x');
  await expect(page.locator('#saveRefinementDialog')).toBeVisible();
  await page.locator('#saveRefinementDialog').getByRole('button', { name: choice, exact: true }).click();
}

async function cardDuration(page: Page, name: string): Promise<number> {
  return clipCard(page, name).locator('video').evaluate(video => (video as HTMLVideoElement).duration);
}

test('trim and Keep both: the refined clip appears next to the original with exactly the staged frames and its sound', async () => {
  await withApp('clip-zoom-edit-keep-both-', async (page, _app, { directory }) => {
    const folder = path.join(directory, 'clips');
    await fs.mkdir(folder);
    // A clip with no source info: frames 0 to 23 of the movie, with its sound.
    await runFfmpeg(['-i', movieFixture, '-frames:v', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      '-map_metadata', '-1', path.join(folder, 'untagged.mp4')]);
    await openFolderInCollection(page, folder, 'untagged.mp4');

    await refine(page, 'untagged.mp4');
    await expect(hintStatus(page)).toHaveText('', { timeout: 90_000 });
    // From the first frame: three frames on, the start; from the last frame (23), four back, the end.
    await pressKeys(page, ['a', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'q', 's', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'w']);
    await saveWith(page, 'Keep both');

    await expect(page.locator('#zoomVideo')).toHaveAttribute('data-name', 'untagged-refined.mp4', { timeout: 90_000 });
    // The folder's list sorts names the way the app does, where a hyphen comes before a dot.
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#grid .thumb').nth(0)).toHaveAttribute('data-name', 'untagged-refined.mp4');
    await expect(page.locator('#grid .thumb').nth(1)).toHaveAttribute('data-name', 'untagged.mp4');
    const saved = path.join(folder, 'untagged-refined.mp4');
    expect(await videoFrameCount(saved)).toBe(17);
    expect(await streamKinds(saved)).toContain('audio');
    expect(await new Mp4Provenance().read(saved)).toBeNull();
  });
});

test('extend and Replace: the clip under its own name holds the extended movie range, named in the movie’s frame numbers', async () => {
  await withApp('clip-zoom-edit-replace-', async (page, _app, { directory, profile, pipelines }) => {
    const movie = path.join(directory, 'Feature.mkv');
    await fs.copyFile(movieFixture, movie);
    const clips = path.join(pipelines, 'extraction-tmp');
    const clip = path.join(clips, 'Feature-001.mp4');
    // The tagged clip: movie frames 30 to 40, cut by a real extraction.
    await openMovieForExactReview(page, movie);
    await lockExactRange(page, 30, 40);
    await page.getByRole('button', { name: 'Extract all (1)' }).click();
    await expect(page.locator('[data-range-id="range-1"]')).toContainText('Extracted as Feature-001.mp4', { timeout: 90_000 });
    await openFolderInCollection(page, clips, 'Feature-001.mp4');
    // If the app asks for the movie, the file picker answers with it.
    await page.evaluate(next => (window as unknown as { clipSandboxDesktop: { __testSetNextMoviePath(path: string): Promise<void> } })
      .clipSandboxDesktop.__testSetNextMoviePath(next), movie);

    await refine(page, 'Feature-001.mp4');
    await expect(hintStatus(page)).not.toHaveText('Preparing the clip…', { timeout: 90_000 });
    await page.keyboard.press('a');
    await expect(hintStatus(page)).toHaveText('', { timeout: 120_000 });
    // From the clip's first frame (movie 30), three frames back into the movie; from its last (movie 40), two on.
    await pressKeys(page, ['a', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'q', 's', 'ArrowRight', 'ArrowRight', 'w']);
    await saveWith(page, 'Replace');

    await expect(page.locator('#zoomVideo')).toHaveAttribute('data-name', 'Feature-001.mp4', { timeout: 90_000 });
    expect(await videoFrameCount(clip)).toBe(16);
    expect((await new Mp4Provenance().read(clip)).toRecord()).toMatchObject({
      sourceMovie: { displayName: 'Feature.mkv' },
      sourceFrameRange: { start: 27, end: 42, startTimeUs: 1_125_000, endTimeUs: 1_750_000 },
      referenceFrames: [{ frameIndex: 27 }, { frameIndex: 42 }],
    });
    const recycled = await fs.readdir(path.join(profile, 'test-recycle-bin'));
    expect(recycled).toHaveLength(1);
    expect(await videoFrameCount(path.join(profile, 'test-recycle-bin', recycled[0], 'Feature-001.mp4'))).toBe(11);
    expect((await fs.readdir(clips)).sort()).toEqual(['Feature-001.mp4', 'Feature.txt']);
    // The grid and Zoom load the new file: it plays 16 frames, not the original 11.
    await expect.poll(() => cardDuration(page, 'Feature-001.mp4')).toBeCloseTo(16 / 24, 1);
    await expect.poll(() => page.locator('#zoomVideo').evaluate(video => (video as HTMLVideoElement).duration)).toBeCloseTo(16 / 24, 1);
  });
});
