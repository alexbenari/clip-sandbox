import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('GIF Extraction is fixed with one shared player while Refine Gif remains contextual', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-shell-'));
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));

    await expect(page.locator('#appScreenSelector option')).toHaveText(['GIF Extraction', 'Collection', 'Settings']);
    await expect(page.locator('#appScreenSelector option', { hasText: 'Refine Gif' })).toHaveCount(0);
    await expect(page.locator('#refineGifScreen')).toBeHidden();

    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('#gifExtractionScreen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open movie...' })).toBeFocused();
    await expect(page.locator('#screenCommandHost')).toContainText('No movie open');
    await expect(page.locator('#clipsPanelHost')).toContainText('No captured ranges yet');
    await expect(page.locator('.frame-review-player input[type="range"]')).toHaveCount(1);
    await expect(page.locator('.frame-review-player input[type="range"]')).toBeDisabled();
    await expect(page.locator('#mainScreenHost input[type="range"]')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/gif-extraction-shell-1280.png' });

    await page.evaluate(() => {
      Reflect.set(window, '__gifPlayerRoot', document.querySelector('.frame-review-player'));
      const option = document.createElement('option');
      option.value = 'refine-gif';
      option.textContent = 'Refine Gif';
      option.dataset.contextual = 'true';
      document.querySelector<HTMLSelectElement>('#appScreenSelector')!.append(option);
    });
    await page.locator('#appScreenSelector').selectOption('refine-gif');
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to GIF Extraction' })).toBeFocused();
    expect(await page.evaluate(() => Reflect.get(window, '__gifPlayerRoot') === document.querySelector('.frame-review-player'))).toBe(true);
    await expect(page.locator('#mainScreenHost input[type="range"]')).toHaveCount(1);
    await expect(page.locator('#appScreenSelector option[data-contextual="true"]')).toHaveText('Refine Gif');
    await page.screenshot({ path: 'test-results/refine-gif-shell-1280.png' });
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(page.locator('#gifExtractionScreen')).toBeVisible();
    await expect(page.locator('#appScreenSelector option[data-contextual="true"]')).toHaveCount(0);

    await page.locator('#foldClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('#revealClips')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(820, 650));
    await expect(page.locator('.frame-review-progress-row input')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/gif-extraction-shell-820-clips-folded.png' });

    await page.locator('#revealClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await page.locator('#appScreenSelector').selectOption('collection');
    await expect(page.locator('#clipsPanelHost')).toContainText('No Clips tools for this screen');
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await expect(page.locator('.frame-review-player input[type="range"]')).toHaveCount(1);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
