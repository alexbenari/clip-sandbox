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

/** Marks a start and end frame with Q and W, then locks the range with X. */
export async function lockExactRange(page: Page, startFrame: number, endFrame: number): Promise<void> {
  await seekToFrame(page, startFrame);
  await page.keyboard.press('q');
  await seekToFrame(page, endFrame);
  await page.keyboard.press('w');
  await page.keyboard.press('x');
}
