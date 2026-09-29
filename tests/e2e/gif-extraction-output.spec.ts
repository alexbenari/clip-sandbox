// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const project = path.resolve('.');
const dependenciesPath = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'bestsource_media_service.exe');
const movie = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');

test.skip(process.platform !== 'win32' || !existsSync(dependenciesPath) || !existsSync(nativeService) || !existsSync(movie),
  'The explicit frame-review native build and fixture are not available.');

test('a saved capture can be removed when its source movie is unavailable', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-capture-missing-'));
  const profile = path.join(directory, 'profile');
  const source = path.join(directory, 'source.mkv');
  await fs.mkdir(profile, { recursive: true });
  await fs.copyFile(movie, source);
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const openApp = () => electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  let app = await openApp();
  try {
    let page = await app.firstWindow();
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), source);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    await lockExactRange(page, page.locator('.frame-review-progress-row input'), 3, 5);
    await expect(page.locator('[data-range-id="range-1"]')).toHaveCount(1);
    await app.close();

    await fs.rm(source);
    app = await openApp();
    page = await app.firstWindow();
    await expect(page.locator('[data-range-id="range-1"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Refine range 1' })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove capture 1' }).click();
    await expect(page.locator('[data-range-id]')).toHaveCount(0);
    await app.close();

    app = await openApp();
    page = await app.firstWindow();
    await expect(page.locator('[data-range-id]')).toHaveCount(0);
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
