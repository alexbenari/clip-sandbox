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

test('restart opens GIF Extraction without the previously opened movie', async () => {
  test.setTimeout(120_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-empty-startup-'));
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
      await expect(page.locator('#screenCommandHost')).toContainText('Sample Movie.mkv');
      await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    } finally {
      await first.close();
    }

    const restarted = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });
    try {
      const page = await restarted.firstWindow();
      await expect(page.locator('#gifExtractionScreen')).toBeVisible();
      await expect(page.locator('#screenCommandHost')).toContainText('No movie open');
      await expect(page.locator('#gifExtractionScreen h1')).toHaveText('Choose a movie to begin');
      await expect(page.locator('.frame-review-player input[type="range"]')).toBeDisabled();
    } finally {
      await restarted.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
