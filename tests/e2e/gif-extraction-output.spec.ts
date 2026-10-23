import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

import { generatedMovieFixture, nativeBinaryFolder, nativeFrameReviewUnavailableReason } from '../support/frame-review-dependencies.js';
import { closeAppWithin, launchApp, lockExactRange, openMovieForExactReview, writeAppSettings } from './support/app.js';

const movie = generatedMovieFixture('cfr-audio.mkv');
const timestampRepairMovie = generatedMovieFixture('timestamp-repair-source.mkv');
const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'), movie, timestampRepairMovie);

test.skip(unavailable !== null, unavailable ?? '');

async function extractionWorkspace(prefix: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  await writeAppSettings(profile, { version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false });
  return { directory, profile, destination: path.join(pipelines, 'extraction-tmp') };
}

// The app may close before it creates the folder or the collection file; then there is nothing to check.
function ifMissing<T>(fallback: T): (error: NodeJS.ErrnoException) => T | Promise<never> {
  return error => error?.code === 'ENOENT' ? fallback : Promise.reject(error);
}

test('extracts a movie with a space before its extension into a valid collection', async () => {
  test.setTimeout(120_000);
  const { directory, profile, destination } = await extractionWorkspace('clip-spaced-movie-');
  const source = path.join(directory, 'Sample Movie .mkv');
  await fs.copyFile(movie, source);
  const app = await launchApp(profile);
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, source);
    await lockExactRange(page, 3, 5);

    await page.getByRole('button', { name: 'Extract all (1)' }).click();

    await expect(page.locator('[data-range-id="range-1"]')).toContainText('Extracted as Sample Movie-001.mp4', { timeout: 90_000 });
    expect(await fs.readFile(path.join(destination, 'Sample Movie.txt'), 'utf8')).toBe('Sample Movie-001.mp4\n');
    expect(existsSync(path.join(destination, 'Sample Movie-001.mp4'))).toBe(true);
    await page.locator('#activityIndicatorBtn').click();
    const activity = page.locator('#activityIndicatorList > li');
    const started = activity.filter({ hasText: 'Extraction started for 1 clip.' });
    const extracted = activity.filter({ hasText: /^Extracted Sample Movie-001\.mp4 in \d+ ms\./ });
    const finished = activity.filter({ hasText: 'Extraction finished: 1 of 1 clip extracted.' });
    await expect(started).toHaveCount(1);
    await expect(extracted).toHaveCount(1);
    await expect(finished).toHaveCount(1);
    // Activity lists the newest entry first, so the batch reads finished, clip, started from the top.
    const messages = await activity.allTextContents();
    const positions = [/^Extraction finished: 1 of 1/, /^Extracted Sample Movie-001\.mp4/, /^Extraction started for 1 clip/]
      .map(pattern => messages.findIndex(message => pattern.test(message)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const boundary of [started, finished]) {
      await boundary.locator('summary').click();
      await expect(boundary.locator('details')).toContainText('Source movie: Sample Movie .mkv');
    }
    await extracted.locator('summary').click();
    await expect(extracted.locator('details')).toContainText('Clip: Sample Movie-001.mp4');
    await expect(extracted.locator('details')).toContainText(`Destination folder: ${destination}`);
    await expect(extracted.locator('details')).toContainText('Source movie: Sample Movie .mkv');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('extracts a movie whose timestamps needed repair into a valid collection', async () => {
  test.setTimeout(120_000);
  const { directory, profile, destination } = await extractionWorkspace('clip-normalized-extraction-');
  const source = path.join(directory, 'timestamp-repair-source.mkv');
  await fs.copyFile(timestampRepairMovie, source);
  const app = await launchApp(profile);
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, source);
    await lockExactRange(page, 5, 15);

    await page.getByRole('button', { name: 'Extract all (1)' }).click();

    await expect(page.locator('[data-range-id="range-1"]'))
      .toContainText('Extracted as timestamp-repair-source-001.mp4', { timeout: 90_000 });
    expect(existsSync(path.join(destination, 'timestamp-repair-source-001.mp4'))).toBe(true);
    expect(await fs.readFile(path.join(destination, 'timestamp-repair-source.txt'), 'utf8')).toBe('timestamp-repair-source-001.mp4\n');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

// The fixture encodes in about a second, so the close usually lands before the extraction workspace exists.
// That disposal waits for workspace removal mid-encode is covered in clip-extraction-runtime.spec.ts.
test('closing right after an extraction starts leaves no temporary files or broken collection entry', async () => {
  test.setTimeout(180_000);
  const { directory, profile, destination } = await extractionWorkspace('clip-gif-output-close-');
  const source = path.join(directory, 'Close Test.mkv');
  await fs.copyFile(movie, source);
  const app = await launchApp(profile);
  const mainStderr: string[] = [];
  app.process().stderr?.on('data', chunk => mainStderr.push(chunk.toString('utf8')));
  try {
    const page = await app.firstWindow();
    await openMovieForExactReview(page, source);
    // The whole movie gives the longest encode this fixture allows.
    await lockExactRange(page, 0, 71);
    await page.getByRole('button', { name: 'Extract all (1)' }).click();
    await expect(page.locator('[data-range-id="range-1"] .gif-range-extraction')).toContainText('Encoding from the original movie');
    await closeAppWithin(app, 10_000);

    expect(mainStderr.join('')).not.toContain('Object has been destroyed');
    const entries = await fs.readdir(destination).catch(ifMissing<string[]>([]));
    expect(entries.filter(name => !/\.(mp4|txt)$/i.test(name)), 'leftover temporary files').toEqual([]);
    const collection = await fs.readFile(path.join(destination, 'Close Test.txt'), 'utf8').catch(ifMissing(''));
    const listedClips = collection.split(/\r?\n/).filter(Boolean);
    expect(listedClips.filter(name => !existsSync(path.join(destination, name))), 'collection entries without a clip').toEqual([]);
  } finally {
    await closeAppWithin(app, 10_000).catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
