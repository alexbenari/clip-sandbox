import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

import { projectFolder } from '../../support/frame-review-dependencies.js';

type DesktopTestHooks = {
  clipSandboxDesktop: {
    __testSetNextMoviePath(path: string): Promise<void>;
    __testSetNextFolderPath(path: string): Promise<void>;
  };
};

export async function launchApp(profile: string, extraArgs: readonly string[] = []): Promise<ElectronApplication> {
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ args: ['.', `--user-data-dir=${profile}`, ...extraArgs], cwd: projectFolder, env });
}

export async function writeAppSettings(profile: string, settings: Record<string, unknown>): Promise<void> {
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify(settings)}\n`, 'utf8');
}

/** Closes the app, killing it and failing when shutdown takes longer than `milliseconds`. */
export async function closeAppWithin(app: ElectronApplication, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
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

/**
 * Sets the window's content size and waits until the page has that size and has laid out once.
 * The native resize reaches the page asynchronously, so layout read before that belongs to the old size.
 */
export async function resizeContent(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    // A maximized window ignores setContentSize.
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(size.width, size.height);
  }, { width, height });
  await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

export async function chooseNextFolder(page: Page, folderPath: string): Promise<void> {
  await page.evaluate(next => (window as unknown as DesktopTestHooks).clipSandboxDesktop.__testSetNextFolderPath(next), folderPath);
}

export async function openMovie(page: Page, moviePath: string): Promise<void> {
  await page.evaluate(next => (window as unknown as DesktopTestHooks).clipSandboxDesktop.__testSetNextMoviePath(next), moviePath);
  await page.getByRole('button', { name: 'Open movie...' }).click();
}

export async function openMovieForExactReview(page: Page, moviePath: string): Promise<void> {
  await openMovie(page, moviePath);
  await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
}

/**
 * Moves the movie position slider to a frame. Playwright cannot fill a range input,
 * so this sets the value and sends the events a finished drag sends.
 */
export async function seekToFrame(page: Page, frameIndex: number): Promise<void> {
  await page.locator('.frame-review-progress-row input').evaluate((element, index) => {
    const input = element as HTMLInputElement;
    input.value = String(index);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, frameIndex);
  await expect(page.locator('.frame-review-identity')).toHaveText(`Frame ${frameIndex}`);
}

/**
 * Runs `action` and waits until movie full screen has fully settled: the review player is the full-screen
 * element and the page has grown to the display size. Layout read earlier belongs to a window still resizing.
 */
export async function enterMovieFullScreen(page: Page, action: () => Promise<void>): Promise<void> {
  await action();
  await expect.poll(() => page.evaluate(() => ({
    player: document.fullscreenElement?.classList.contains('frame-review-player') ?? false,
    displaySized: innerWidth === screen.width && innerHeight === screen.height,
  }))).toEqual({ player: true, displaySized: true });
}

export async function leaveMovieFullScreen(page: Page, action: () => Promise<void>): Promise<void> {
  await action();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
}

/**
 * Asserts that `action` neither requests full screen nor leaves anything in full screen. Requests are
 * counted where the app makes them, then a frame and a task are allowed to pass so a request queued
 * behind the key handler would also be counted.
 */
export async function expectNoFullScreenRequest(page: Page, action: () => Promise<void>): Promise<void> {
  await page.evaluate(() => {
    const counter = window as unknown as { __fullScreenRequests?: number };
    if (counter.__fullScreenRequests === undefined) {
      const request = Element.prototype.requestFullscreen;
      Element.prototype.requestFullscreen = function countedRequest(this: Element, options?: FullscreenOptions) {
        counter.__fullScreenRequests = (counter.__fullScreenRequests ?? 0) + 1;
        return request.call(this, options);
      };
    }
    counter.__fullScreenRequests = 0;
  });
  await action();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))));
  expect(await page.evaluate(() => ({
    requests: (window as unknown as { __fullScreenRequests?: number }).__fullScreenRequests,
    fullScreen: document.fullscreenElement !== null,
  }))).toEqual({ requests: 0, fullScreen: false });
}

/** Marks a start and end frame with Q and W, then locks the range with X. */
export async function lockExactRange(page: Page, startFrame: number, endFrame: number): Promise<void> {
  await seekToFrame(page, startFrame);
  await page.keyboard.press('q');
  await seekToFrame(page, endFrame);
  await page.keyboard.press('w');
  await page.keyboard.press('x');
}
