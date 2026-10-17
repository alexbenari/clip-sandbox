import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resizeContent } from './support/app.js';

test('GIF Extraction starts empty with one movie player and keeps per-screen panel states', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-shell-'));
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    await resizeContent(app, page, 1280, 800);

    await expect(page.locator('#appScreenSelector option')).toHaveText(['GIF Extraction', 'Collection', 'Settings']);
    await expect(page.locator('#appScreenSelector option', { hasText: 'Refine Gif' })).toHaveCount(0);
    await expect(page.locator('#refineGifScreen')).toBeHidden();

    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('#gifExtractionScreen')).toBeVisible();
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).toHaveClass(/folded/);
    await expect(page.getByRole('button', { name: 'Open movie...' })).toBeFocused();
    await expect(page.locator('#screenCommandHost')).toContainText('No movie open');
    await expect(page.locator('#clipsPanelHost')).toContainText('No captured ranges yet');
    await expect(page.locator('.frame-review-player input[type="range"]')).toHaveCount(1);
    await expect(page.locator('.frame-review-player input[type="range"]')).toBeDisabled();
    await expect(page.locator('#mainScreenHost input[type="range"]')).toHaveCount(1);

    await page.locator('#foldClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('#revealClips')).toBeVisible();
    await resizeContent(app, page, 820, 650);
    await expect(page.locator('.frame-review-progress-row input')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(820);

    await page.locator('#appScreenSelector').selectOption('collection');
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    await page.locator('#revealClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await page.locator('#appScreenSelector').selectOption('collection');
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('#clipsPanelHost')).toContainText('No Clips tools for this screen');
    await page.locator('#revealClips').click();
    await page.locator('#appScreenSelector').selectOption('settings');
    await expect(page.locator('#clipsPanel')).toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).toHaveClass(/folded/);
    await page.locator('#appScreenSelector').selectOption('collection');
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).not.toHaveClass(/folded/);
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('#pipelinesPanel')).toHaveClass(/folded/);
    await expect(page.locator('.frame-review-player input[type="range"]')).toHaveCount(1);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
