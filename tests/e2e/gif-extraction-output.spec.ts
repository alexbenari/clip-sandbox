// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, _electron as electron } from '@playwright/test';

const project = path.resolve('.');
const require = createRequire(import.meta.url);
const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
const dependenciesPath = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'bestsource_media_service.exe');
const movie = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');
const reviewDirectory = path.join(project, '.impeccable', 'review');

test.skip(process.platform !== 'win32' || !existsSync(dependenciesPath) || !existsSync(nativeService) || !existsSync(movie),
  'The explicit frame-review native build and fixture are not available.');

test('extract current and Extract All publish original-source clips to extraction-tmp', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-output-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(reviewDirectory, { recursive: true });
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify({
    version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false,
  })}\n`, 'utf8');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const progress = page.locator('.frame-review-progress-row input');
    await progress.evaluate(input => {
      input.value = '8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 8');
    await page.keyboard.press('q');
    await progress.evaluate(input => {
      input.value = '23';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 23');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await page.keyboard.press('e');
    await expect(page.locator('[data-range-id="range-1"] .gif-range-extraction'))
      .toContainText('Extracted as cfr-audio-001.mp4', { timeout: 90_000 });
    const destination = path.join(pipelines, 'extraction-tmp');
    await page.locator('#appScreenSelector').selectOption('collection');
    await page.evaluate(folderPath => window.clipSandboxDesktop.__testSetNextFolderPath(folderPath), destination);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(1);
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await progress.evaluate(input => {
      input.value = '24';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 24');
    await page.keyboard.press('q');
    await progress.evaluate(input => {
      input.value = '31';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 31');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await page.locator('[data-extract-all]').click();
    await expect(page.locator('[data-range-id="range-2"] .gif-range-extraction'))
      .toContainText('Extracted as cfr-audio-002.mp4', { timeout: 90_000 });

    await page.locator('#appScreenSelector').selectOption('collection');
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    const output = path.join(destination, 'cfr-audio-001.mp4');
    expect(await fs.readFile(path.join(destination, 'cfr-audio.txt'), 'utf8'))
      .toBe('cfr-audio-001.mp4\ncfr-audio-002.mp4\n');
    expect((await fs.stat(output)).size).toBeGreaterThan(0);
    const products = new NativeProductLocator({ projectFolder: project, packaged: false });
    const probe = JSON.parse(execFileSync(products.ffprobe(), [
      '-v', 'error', '-show_entries', 'stream=codec_type,width,height,pix_fmt', '-of', 'json', output,
    ], { encoding: 'utf8', windowsHide: true, env: products.environment() }));
    expect(probe.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', width: 320, height: 180, pix_fmt: 'yuv420p' }),
      expect.objectContaining({ codec_type: 'audio' }),
    ]));
    await page.screenshot({ path: path.join(reviewDirectory, 'ms7-extraction-1280.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 700));
    await expect(page.locator('[data-extract-all]')).toBeVisible();
    await page.screenshot({ path: path.join(reviewDirectory, 'ms7-extraction-900.png') });
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('closing during extraction leaves no temporary workspace or broken collection entry', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-output-close-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify({
    version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false,
  })}\n`, 'utf8');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  const mainStderr = [];
  app.process().stderr?.on('data', chunk => mainStderr.push(chunk.toString('utf8')));
  try {
    const page = await app.firstWindow();
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const progress = page.locator('.frame-review-progress-row input');
    await progress.evaluate(input => {
      input.value = '8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 8');
    await page.keyboard.press('q');
    await progress.evaluate(input => {
      input.value = '31';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 31');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await page.keyboard.press('e');
    await expect(page.locator('[data-range-id="range-1"] .gif-range-extraction'))
      .toContainText('Encoding from the original movie');

    await closeAppWithin(app, 10_000);

    expect(mainStderr.join('')).not.toContain('Object has been destroyed');
    const destination = path.join(pipelines, 'extraction-tmp');
    const entries = await fs.readdir(destination).catch(error => error?.code === 'ENOENT' ? [] : Promise.reject(error));
    expect(entries.some(name => name.startsWith('.clip-extraction-'))).toBe(false);
    if (entries.includes('cfr-audio.txt')) {
      const published = (await fs.readFile(path.join(destination, 'cfr-audio.txt'), 'utf8')).split(/\r?\n/).filter(Boolean);
      for (const filename of published) expect(existsSync(path.join(destination, filename))).toBe(true);
    }
  } finally {
    await closeAppWithin(app, 10_000).catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('Extract All preserves later media and retries publication without re-encoding', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-output-repair-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  const destination = path.join(pipelines, 'extraction-tmp');
  const collectionPath = path.join(destination, 'cfr-audio.txt');
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(collectionPath, { recursive: true });
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify({
    version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false,
  })}\n`, 'utf8');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const progress = page.locator('.frame-review-progress-row input');
    await lockExactRange(page, progress, 8, 15);
    await lockExactRange(page, progress, 16, 23);

    await page.locator('[data-extract-all]').click();
    await expect(page.locator('[data-range-id="range-1"] .gif-range-extraction'))
      .toContainText('Clip created; collection save failed', { timeout: 90_000 });
    await expect(page.locator('[data-range-id="range-2"] .gif-range-extraction'))
      .toContainText('Clip created; collection save failed', { timeout: 90_000 });
    expect((await fs.readdir(destination)).filter(name => name.endsWith('.mp4')).sort())
      .toEqual(['cfr-audio-001.mp4', 'cfr-audio-002.mp4']);

    await fs.rm(collectionPath, { recursive: true, force: true });
    await page.locator('[data-range-id="range-1"] [data-retry-publication]').click();
    await expect(page.locator('[data-range-id="range-1"] .gif-range-extraction'))
      .toContainText('Extracted as cfr-audio-001.mp4');
    await page.locator('[data-range-id="range-2"] [data-retry-publication]').click();
    await expect(page.locator('[data-range-id="range-2"] .gif-range-extraction'))
      .toContainText('Extracted as cfr-audio-002.mp4');

    expect(await fs.readFile(collectionPath, 'utf8')).toBe('cfr-audio-001.mp4\ncfr-audio-002.mp4\n');
    expect((await fs.readdir(destination)).filter(name => name.endsWith('.mp4')).sort())
      .toEqual(['cfr-audio-001.mp4', 'cfr-audio-002.mp4']);
  } finally {
    await closeAppWithin(app, 10_000).catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function lockExactRange(page, progress, startFrame, endFrame) {
  await progress.evaluate((input, frame) => {
    input.value = String(frame);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, startFrame);
  await expect(page.locator('.frame-review-identity')).toContainText(`Frame ${startFrame}`);
  await page.keyboard.press('q');
  await progress.evaluate((input, frame) => {
    input.value = String(frame);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, endFrame);
  await expect(page.locator('.frame-review-identity')).toContainText(`Frame ${endFrame}`);
  await page.keyboard.press('w');
  await page.keyboard.press('a');
}

async function closeAppWithin(app, milliseconds) {
  let timer;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          app.process().kill();
          reject(new Error(`Electron shutdown exceeded ${milliseconds}ms.`));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
