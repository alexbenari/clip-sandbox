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

test.skip(
  process.platform !== 'win32' || !existsSync(dependenciesPath) || !existsSync(nativeService) || !existsSync(movie),
  'The explicit frame-review native build and fixture are not available.',
);

async function seekFrame(page, value: string): Promise<void> {
  const progress = page.locator('.frame-review-progress-row input');
  await progress.evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(page.locator('.frame-review-busy')).toBeHidden({ timeout: 30_000 });
}

async function captureInexactRange(page, start: string, end: string): Promise<void> {
  const play = page.locator('.frame-review-transport [data-command="play-pause"]');
  await expect(play).toBeEnabled();
  if (await play.getAttribute('aria-label') === 'Play') await play.click();
  await page.keyboard.press('q');
  await seekFrame(page, start);
  await page.keyboard.press('w');
  await seekFrame(page, end);
  await page.keyboard.press('a');
}

test('refines inexact ranges through the contextual screen and preserves queue context', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-refine-'));
  const profile = path.join(directory, 'profile');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.gif-workflow-source')).toContainText('cfr-audio.mkv');
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });

    await captureInexactRange(page, '12000', '26000');
    await expect(page.locator('.gif-range-card.is-inexact')).toHaveCount(1);
    await captureInexactRange(page, '34000', '48000');
    await expect(page.locator('.gif-range-card.is-inexact')).toHaveCount(2);
    await expect(page.locator('#clipsPanelHost')).toContainText('Needs exact frames');

    const cards = page.locator('.gif-range-card.is-inexact');
    const firstRangeId = await cards.nth(0).getAttribute('data-range-id');
    const secondRangeId = await cards.nth(1).getAttribute('data-range-id');
    expect(firstRangeId).toBeTruthy();
    expect(secondRangeId).toBeTruthy();

    // Leaving before A discards only staged endpoint replacements.
    await cards.nth(0).getByRole('button', { name: 'Refine range 1' }).click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('.gif-refinement-workbench')).toBeVisible();
    await expect(page.locator('#clipsPanelHost')).toContainText('Needs exact frames');
    await expect(page.locator('.frame-review-transport [data-command="play-pause"]')).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame');
    await expect(page.locator('[data-command="set-start"]')).toHaveAttribute('aria-pressed', 'true');
    await fs.mkdir(reviewDirectory, { recursive: true });
    await page.screenshot({ path: path.join(reviewDirectory, 'ms6-refine-1280.png'), fullPage: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 700));
    await page.screenshot({ path: path.join(reviewDirectory, 'ms6-refine-900.png'), fullPage: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(page.locator('#gifExtractionScreen')).toBeVisible();
    await expect(page.locator(`.gif-range-card[data-range-id="${firstRangeId}"]`)).toHaveClass(/is-inexact/);

    // Re-enter the first range, stage exact Start and End, and commit with A.
    await page.locator(`.gif-range-card[data-range-id="${firstRangeId}"]`).getByRole('button', { name: 'Refine range 1' }).click();
    await expect(page.locator('.frame-review-identity')).toContainText('Frame');
    await expect(page.locator('.frame-review-transport [data-command="play-pause"]')).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('[data-command="lock-refinement"]')).toBeDisabled();
    await page.keyboard.press('q');
    await seekFrame(page, '16000');
    await page.keyboard.press('w');
    await expect(page.locator('[data-refine-end-value]')).toContainText('Frame');
    await seekFrame(page, '30000');
    await page.keyboard.press('w');
    await expect(page.locator('[data-refine-start-value]')).toContainText('Frame');
    await expect(page.locator('[data-refine-end-value]')).toContainText('Frame');
    await expect(page.locator('[data-command="lock-refinement"]')).toBeEnabled();

    const extract = page.locator('[data-command="extract-current"]');
    await expect(extract).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Extract All/ })).toBeDisabled();
    await page.keyboard.press('a');

    await expect(page.locator('[data-command="lock-refinement"]')).toBeDisabled();
    await expect(page.locator('.gif-workflow-command-status')).toContainText('Exact range locked');
    await expect(extract).toBeEnabled();
    await expect(extract).toHaveAttribute('title', 'Extract this exact range');
    await expect(page.getByRole('button', { name: /^Extract All/ })).toBeEnabled();
    const refinedCard = page.locator(`.gif-range-card[data-range-id="${firstRangeId}"]`);
    await expect(refinedCard).toHaveClass(/is-exact/);
    await expect(refinedCard).toContainText('Ready to extract');
    await expect(refinedCard.locator('img')).toHaveCount(1);
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toHaveClass(/is-inexact/);
    await expect(page.locator('.gif-range-card')).toHaveCount(2);

    await expect(page.getByRole('button', { name: 'Next inexact clip' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next inexact clip' }).click();
    await expect(page.locator('[data-refine-range-title]')).toContainText('Range 2');
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toHaveClass(/is-inexact/);
    await expect(page.locator('.frame-review-identity')).toContainText('Frame');
    await expect(page.locator('[data-command="set-start"]')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(page.locator('#gifExtractionScreen')).toBeVisible();
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toBeFocused();
    await expect(page.locator(`.gif-range-card[data-range-id="${firstRangeId}"]`)).toHaveClass(/is-exact/);
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toHaveClass(/is-inexact/);
    await expect(page.getByRole('button', { name: /^Extract All/ })).toBeEnabled();
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
