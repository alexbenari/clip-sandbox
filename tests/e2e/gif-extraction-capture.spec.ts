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
const reviewDirectory = path.join(project, '.impeccable', 'review');

test.skip(process.platform !== 'win32' || !existsSync(dependenciesPath) || !existsSync(nativeService) || !existsSync(movie),
  'The explicit frame-review native build and fixture are not available.');

test('captures exact and inexact ranges without interrupting playback', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-capture-'));
  const profile = path.join(directory, 'profile');
  await fs.mkdir(reviewDirectory, { recursive: true });
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    const missingThumbnail = await page.evaluate(() => window.clipSandboxDesktop.thumbnailCache.load('thumbnail_12345678'));
    expect(missingThumbnail).toEqual({ ok: false, error: { message: 'Thumbnail could not be loaded.' } });
    expect(JSON.stringify(missingThumbnail)).not.toMatch(/[A-Z]:\\/i);
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();

    await expect(page.locator('.gif-workflow-source')).toContainText('cfr-audio.mkv');
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    await page.locator('#activityIndicatorBtn').click();
    await expect(page.locator('#activityIndicatorPanel')).toContainText('prepared review cache');
    await page.locator('#activityIndicatorPanel [data-utility-close]').click();
    const progress = page.locator('.frame-review-progress-row input');
    await progress.evaluate((input) => {
      input.value = '8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-error')).toBeEmpty();
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 8');
    await page.keyboard.press('q');
    await progress.evaluate((input) => {
      input.value = '23';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 23');
    await page.keyboard.press('w');
    await page.keyboard.press('a');

    await expect(page.locator('.gif-range-card.is-exact')).toHaveCount(1);
    await expect(page.locator('.gif-range-card.is-exact img')).toHaveCount(1);
    await expect(page.locator('#clipsPanelHost')).toContainText('Ready to extract');

    const play = page.locator('.frame-review-transport [data-command="play-pause"]');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause');
    await expect(page.locator('.frame-review-identity')).toContainText('Playback time', { timeout: 10_000 });
    const currentTime = page.locator('.frame-review-progress-row [data-time="current"]');
    const initialPlaybackTime = await currentTime.textContent();
    await expect.poll(() => currentTime.textContent(), { timeout: 10_000 }).not.toBe(initialPlaybackTime);
    await page.keyboard.press('q');
    const markedStartTime = await currentTime.textContent();
    await expect.poll(() => currentTime.textContent(), { timeout: 10_000 }).not.toBe(markedStartTime);
    await page.keyboard.press('w');
    await page.keyboard.press('a');

    await expect(play).toHaveAttribute('aria-label', 'Pause');
    await expect(page.locator('.gif-range-card.is-inexact')).toHaveCount(1);
    await expect(page.locator('.gif-range-card.is-inexact img')).toHaveCount(1);
    await expect(page.locator('#clipsPanelHost')).toContainText('Needs exact frames');
    await page.screenshot({ path: path.join(reviewDirectory, 'ms5-capture-1280.png') });

    await page.keyboard.press('q');
    await expect(page.locator('.gif-range-card.is-draft')).toHaveCount(1);
    await expect(page.locator('#clipsPanelHost')).toContainText('Current draft');

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 680));
    await expect(progress).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(reviewDirectory, 'ms5-capture-900.png') });
  } finally {
    await app.close().catch(() => undefined);
    await expect.poll(async () => existsSync(path.join(profile, 'cache', 'thumbnails')), { timeout: 10_000 }).toBe(false);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
