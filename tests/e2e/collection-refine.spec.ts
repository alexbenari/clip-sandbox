// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const project = path.resolve('.');
const dependencies = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'bestsource_media_service.exe');
const fixture = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');

test.skip(process.platform !== 'win32' || !existsSync(dependencies) || !existsSync(nativeService) || !existsSync(fixture),
  'Native frame review and generated media fixture are required.');

test('refines an extracted collection clip from its original movie and adds a new clip to that collection', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-collection-refine-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  const source = path.join(directory, 'source.mkv');
  await fs.mkdir(profile, { recursive: true });
  await fs.copyFile(fixture, source);
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify({
    version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false,
  })}\n`, 'utf8');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(moviePath => window.clipSandboxDesktop.__testSetNextMoviePath(moviePath), source);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const progress = page.locator('.frame-review-progress-row input');
    await progress.evaluate(input => {
      input.value = '3';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 3');
    await page.keyboard.press('q');
    await progress.evaluate(input => {
      input.value = '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 5');
    await page.keyboard.press('w');
    await page.keyboard.press('x');
    await page.getByRole('button', { name: 'Extract All (1)' }).click();
    await expect(page.locator('[data-range-id="range-1"]')).toContainText('Extracted as source-001.mp4', { timeout: 90_000 });
    const captureDirectory = path.join(profile, 'clip-captures');
    const captureFilename = (await fs.readdir(captureDirectory)).find(name => name.endsWith('.json'));
    expect(captureFilename).toBeDefined();
    const capturePath = path.join(captureDirectory, captureFilename);
    await expect.poll(async () => JSON.parse(await fs.readFile(capturePath, 'utf8')).ranges.length).toBe(0);
    const savedCapturesBeforeRefine = await fs.readFile(capturePath, 'utf8');

    const collectionFolder = path.join(pipelines, 'extraction-tmp');
    await page.locator('#appScreenSelector').selectOption('collection');
    await page.evaluate(folderPath => window.clipSandboxDesktop.__testSetNextFolderPath(folderPath), collectionFolder);
    await page.click('#pickBtn');
    const pipelineClip = page.locator('#grid .thumb[data-name="source-001.mp4"]');
    await expect(pipelineClip).toBeVisible();
    await pipelineClip.click({ button: 'right' });
    const pipelineRefine = page.locator('#clipContextMenu [data-item-id="refine-clip"]');
    await expect(pipelineRefine).toBeEnabled();
    await pipelineRefine.click();
    expect(await page.locator('#appScreenSelector').inputValue()).toBe('collection-refine');
    await expect(page.locator('#collection-refineScreen [data-refine-range-title]')).toContainText('Range 1', { timeout: 90_000 });
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await page.keyboard.press('e');
    await expect(page.locator('#collection-refineScreen [data-refine-range-title]')).toContainText('Range 1');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.keyboard.press('x');
    await page.locator('#collection-refineScreen [data-command="extract-current"]').click();
    await expect.poll(async () => existsSync(path.join(collectionFolder, 'source-002.mp4'))).toBe(true);
    expect(await fs.readFile(path.join(collectionFolder, 'source.txt'), 'utf8')).toBe('source-001.mp4\n');
    await page.getByRole('button', { name: 'Back to Collection' }).click();
    await expect(page.locator('#grid .thumb[data-name="source-002.mp4"]')).toBeVisible();
    await page.selectOption('#activeCollectionName', 'source.txt');
    const clip = page.locator('#grid .thumb[data-name="source-001.mp4"]');
    await expect(clip).toBeVisible();
    await clip.click({ button: 'right' });
    const refine = page.locator('#clipContextMenu [data-item-id="refine-clip"]');
    await expect(refine).toBeEnabled();
    await refine.click();
    expect(await page.locator('#appScreenSelector').inputValue()).toBe('collection-refine');
    await expect(page.locator('#collection-refineScreen [data-refine-range-title]')).toContainText('Range 1', { timeout: 90_000 });
    await expect(page.locator('[aria-label="Refined collection clip"] [data-extract-range]')).toBeDisabled();
    const refinedProgress = page.locator('.frame-review-progress-row input');
    await refinedProgress.evaluate(input => {
      input.value = '6';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 6');
    await page.keyboard.press('w');
    await page.keyboard.press('x');
    const loop = page.locator('#collection-refineScreen [data-command="loop-range"]');
    await expect(loop).toBeEnabled();
    await page.keyboard.press('a');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 3');
    await page.keyboard.press('s');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 6');
    await page.locator('[aria-label="Refined collection clip"] [data-refine-range="range-1"]').click();
    await expect(page.locator('#collection-refineScreen [data-command="lock-refinement"]')).toBeEnabled();
    await page.keyboard.press('x');
    await expect(page.locator('#collection-refineScreen [data-command="extract-current"]')).toBeEnabled();
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await page.keyboard.press('e');
    expect(existsSync(path.join(collectionFolder, 'source-003.mp4'))).toBe(false);
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.keyboard.press('e');
    await expect.poll(async () => fs.readFile(path.join(collectionFolder, 'source.txt'), 'utf8'))
      .toBe('source-001.mp4\nsource-003.mp4\n');
    expect(existsSync(path.join(collectionFolder, 'source-003.mp4'))).toBe(true);
    expect(await fs.readFile(capturePath, 'utf8')).toBe(savedCapturesBeforeRefine);
    await page.getByRole('button', { name: 'Back to Collection' }).click();
    await expect(page.locator('#grid .thumb[data-name="source-003.mp4"]')).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
