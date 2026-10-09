// @ts-nocheck
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const project = path.resolve('.');
const movie = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'libvlc_media_service.exe');
const evidence = path.join(project, 'test-evidence', 'gif-movie-fullscreen', 'G1');

test.skip(process.platform !== 'win32' || !existsSync(movie) || !existsSync(nativeService),
  'The native player and exact-ready movie fixture are required for this probe.');

test('F has no effect before a movie review session exists', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-movie-fs-empty-'));
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    const player = page.locator('.frame-review-player');
    await expect(player.getByRole('button', { name: 'Full screen' })).toBeDisabled();
    await player.focus();
    await page.keyboard.press('f');
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('element full screen probe lifts the review player into true display full screen', async () => {
  test.setTimeout(120_000);
  await fs.mkdir(evidence, { recursive: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-movie-fs-probe-'));
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    const readHost = () => page.locator('.frame-review-player').evaluate(player => {
      const host = player.parentElement.getBoundingClientRect();
      return { width: host.width, height: host.height };
    });
    const before = await readHost();
    await page.screenshot({ path: path.join(evidence, 'before.png') });
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'elementFullscreenProbe';
      button.textContent = 'Enter player full screen probe';
      button.addEventListener('click', () => {
        void document.querySelector('.frame-review-player').requestFullscreen();
      });
      document.body.append(button);
    });
    await page.locator('#elementFullscreenProbe').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    const during = await readHost();
    const windowState = await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { fullScreen: win.isFullScreen(), bounds: win.getBounds(), display: screen.getDisplayMatching(win.getBounds()).bounds };
    });
    expect(windowState.fullScreen).toBe(true);
    expect(windowState.bounds).toEqual(windowState.display);
    await page.screenshot({ path: path.join(evidence, 'during.png') });
    await page.locator('.frame-review-player').focus();
    await page.evaluate(() => {
      window.__probeEscapeEvents = 0;
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.__probeEscapeEvents += 1;
      }, { once: true });
    });
    await page.keyboard.press('Escape');
    const escapeResult = await (async () => ({
      element: await page.evaluate(() => document.fullscreenElement?.className ?? null),
      window: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      keyEvents: await page.evaluate(() => window.__probeEscapeEvents),
    }))();
    if (escapeResult.element) {
      await page.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      });
    }
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    const after = await readHost();
    await page.screenshot({ path: path.join(evidence, 'after.png') });
    await fs.writeFile(path.join(evidence, 'host-geometry.json'), JSON.stringify({ before, during, after, windowState, escapeResult }, null, 2));
    expect(after.width).toBeGreaterThan(0);
    expect(after.height).toBeGreaterThan(0);
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('F and Escape review the same movie at display size and restore the workspace', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-movie-fs-flow-'));
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
  try {
    const page = await app.firstWindow();
    const player = page.locator('.frame-review-player');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    await expect(player.getByRole('button', { name: 'Full screen' })).toBeEnabled();
    await page.locator('#foldClips').click();
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    const position = player.locator('.frame-review-progress-row input[type="range"]');
    await position.evaluate(input => {
      input.value = '10';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(player.locator('.frame-review-identity')).toHaveText('Frame 10');
    const hostHeight = () => player.evaluate(element => element.parentElement.getBoundingClientRect().height);
    const beforeHeight = await hostHeight();
    await player.getByRole('button', { name: 'Full screen' }).focus();
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await expect(player).toBeFocused();
    await expect(position).toHaveValue('10');
    expect(await hostHeight()).toBeCloseTo(beforeHeight, 0);
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(player.locator('.frame-review-transport')).toBeHidden();
    await page.mouse.click(960, 540);
    await expect(player.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
    await fs.mkdir(path.join(evidence, 'flow'), { recursive: true });
    await page.screenshot({ path: path.join(evidence, 'flow', 'movie-full-screen.png') });
    const row = player.locator('.frame-review-progress-row');
    await expect(row.locator('span')).toHaveCount(2);
    await expect(row.locator('input[type="range"]')).toHaveCount(1);
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });
    await page.screenshot({ path: path.join(evidence, 'flow', 'movie-full-screen-idle.png') });
    await page.mouse.move(300, 300);
    await expect(row).toHaveCSS('opacity', '1');
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(player).toBeFocused();
    await expect(player.locator('.frame-review-identity')).toHaveText('Frame 10');
    expect(await hostHeight()).toBeCloseTo(beforeHeight, 0);
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    await expect(page.locator('#foldClips')).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: path.join(evidence, 'flow', 'normal-after-exit.png') });
    await player.getByRole('combobox', { name: 'Jump by seconds' }).focus();
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await expect(player).toBeFocused();
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(player).toBeFocused();
    await page.locator('#keyboardMapBtn').click();
    await expect(page.locator('#keyboardMapPanel')).toContainText('Enter or exit movie full screen');
    await expect(page.locator('#keyboardMapPanel')).toContainText('Exit movie full screen');
    await page.keyboard.press('Escape');
    await page.locator('#activityIndicatorBtn').click();
    await expect(page.locator('#activityIndicatorPanel')).toBeVisible();
    await player.getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('frame-review-player'))).toBe(true);
    await expect(page.locator('#activityIndicatorPanel')).toBeHidden();
    await expect(player).toBeFocused();
    const barBox = await position.boundingBox();
    expect(barBox).not.toBeNull();
    await page.mouse.move(barBox.x + barBox.width * 0.25, barBox.y + barBox.height / 2);
    await page.mouse.down();
    await position.evaluate(input => {
      input.value = '20';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(row).toHaveCSS('opacity', '1', { timeout: 4_000 });
    await expect(player.locator('.frame-review-identity')).toHaveText('Frame 20');
    await page.mouse.up();
    await expect(player).toBeFocused();
    await page.mouse.move(300, 300);
    await expect(row).toHaveCSS('opacity', '0', { timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(player).toBeFocused();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
