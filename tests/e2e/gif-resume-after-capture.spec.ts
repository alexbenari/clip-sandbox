import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const project = path.resolve('.');
const nativeService = path.join(project, 'native-build', 'frame-review', 'bin', 'bestsource_media_service.exe');
const fixture = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'cfr-audio.mkv');

test.skip(process.platform !== 'win32' || !existsSync(nativeService) || !existsSync(fixture),
  'Native frame review and generated media fixture are required.');

test('opening a movie with saved captures displays the frame after the last range', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-resume-capture-'));
  const profile = path.join(directory, 'profile');
  const movie = path.join(directory, 'Sample Movie.mkv');
  await fs.copyFile(fixture, movie);
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;

  try {
    const first = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
    try {
      const page = await first.firstWindow();
      await page.evaluate(moviePath => (window as unknown as {
        clipSandboxDesktop: { __testSetNextMoviePath(path: string): Promise<void> };
      }).clipSandboxDesktop.__testSetNextMoviePath(moviePath), movie);
      await page.getByRole('button', { name: 'Open movie…' }).click();
      await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
      const progress = page.locator('.frame-review-progress-row input');
      for (const [frame, key] of [[3, 'q'], [5, 'w']] as const) {
        await progress.evaluate((input, nextFrame) => {
          (input as HTMLInputElement).value = String(nextFrame);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, frame);
        await expect(page.locator('.frame-review-identity')).toContainText(`Frame ${frame}`);
        await page.keyboard.press(key);
      }
      await page.keyboard.press('x');
      await expect(page.locator('[data-range-id="range-1"]')).toBeVisible();
    } finally {
      await first.close();
    }

    const restarted = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
    try {
      const page = await restarted.firstWindow();
      await expect(page.locator('#screenCommandHost')).toContainText('No movie open');
      await page.evaluate(moviePath => (window as unknown as {
        clipSandboxDesktop: { __testSetNextMoviePath(path: string): Promise<void> };
      }).clipSandboxDesktop.__testSetNextMoviePath(moviePath), movie);
      await page.getByRole('button', { name: 'Open movie…' }).click();
      await expect(page.locator('[data-range-id="range-1"]')).toBeVisible();
      await expect(page.locator('.frame-review-identity')).toContainText('Frame 6', { timeout: 90_000 });
      await expect(page.locator('.frame-review-progress-row input')).toHaveValue('6');
    } finally {
      await restarted.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
