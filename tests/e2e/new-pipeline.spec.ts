import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import { gridClipNames, launchApp, openActivity, writeAppSettings } from './support/app.js';

const openPipelineName = (page: Page) => page.locator('#activeCollectionName option:checked');
const listedPipelines = (page: Page) => page.getByRole('button', { name: /^Expand (?!collection )/ });

test('a pipeline created from the Pipelines panel is listed in order and focused, reported in Activity, leaves the open pipeline in place, and loads as a pipeline with no clips', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-new-pipeline-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  await fs.mkdir(path.join(pipelines, 'Sample'), { recursive: true });
  await fs.copyFile(path.resolve('tests/e2e/fixtures/video-edit/clips/source.mp4'), path.join(pipelines, 'Sample', 'sample-01.mp4'));
  await writeAppSettings(profile, { version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false, startupScreenId: 'collection' });
  const app = await launchApp(profile);
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Load Sample' }).click();
    await expect(openPipelineName(page)).toHaveText('Sample');
    await expect.poll(() => gridClipNames(page)).toEqual(['sample-01.mp4']);

    await page.getByRole('button', { name: 'New pipeline' }).click();
    await page.getByRole('textbox', { name: 'Pipeline name' }).fill('Heist films');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Expand Heist films' })).toBeFocused();
    expect(await listedPipelines(page).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual(['Expand Heist films', 'Expand Sample']);
    expect(existsSync(path.join(pipelines, 'Heist films'))).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Pipeline name' })).toHaveCount(0);
    await openActivity(page);
    await expect(page.locator('#activityIndicatorList')).toContainText('Created pipeline Heist films');
    await page.locator('#activityIndicatorBtn').click();
    await expect(openPipelineName(page)).toHaveText('Sample');
    expect(await gridClipNames(page)).toEqual(['sample-01.mp4']);

    await page.getByRole('button', { name: 'Load Heist films' }).click();
    await expect(openPipelineName(page)).toHaveText('Heist films');
    await expect.poll(() => gridClipNames(page)).toEqual([]);
    await openActivity(page);
    await expect(page.locator('#activityIndicatorList')).toContainText('Loaded pipeline with no clips.');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
