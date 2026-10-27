import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';

import { sourceMovieFixture, sourceMovieTag } from '../support/source-movie-fixtures.js';
import { chooseNextFolder, launchApp } from './support/app.js';

const taggedMovieName = path.parse(JSON.parse(sourceMovieTag.value).sourceMovie.displayName).name;

let tempRoot = '';
let app: ElectronApplication | null = null;

test.beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-source-glyph-'));
});

test.afterEach(async () => {
  await app?.close();
  app = null;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('opening a folder marks only the clip that came from a movie', async () => {
  const clipFolder = path.join(tempRoot, 'clips');
  await fs.mkdir(clipFolder);
  await fs.copyFile(sourceMovieFixture('tagged.mp4'), path.join(clipFolder, 'from-movie.mp4'));
  await fs.copyFile(sourceMovieFixture('untagged.mp4'), path.join(clipFolder, 'no-movie.mp4'));
  app = await launchApp(path.join(tempRoot, 'profile'));
  const page = await app.firstWindow();
  await page.locator('#appScreenSelector').selectOption('collection');

  await chooseNextFolder(page, clipFolder);
  await page.locator('#pickBtn').click();

  const taggedGlyph = page.locator('#grid .thumb[data-name="from-movie.mp4"] .source-glyph');
  await expect(taggedGlyph).toBeVisible();
  await expect(taggedGlyph).toHaveAttribute('title', `From ${taggedMovieName}`);
  await expect(page.locator('#grid .thumb[data-name="no-movie.mp4"]')).toBeVisible();
  await expect(page.locator('#grid .thumb[data-name="no-movie.mp4"] .source-glyph')).toHaveCount(0);
});
