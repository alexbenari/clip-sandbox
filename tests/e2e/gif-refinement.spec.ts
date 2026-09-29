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
  const progress = page.locator('.frame-review-progress-row input');
  await expect(play).toBeEnabled();
  if (await play.getAttribute('aria-label') === 'Play') await play.click();
  await seekFrame(page, start);
  await expect.poll(() => progress.inputValue(), { timeout: 10_000 }).not.toBe(start);
  await page.keyboard.press('q');
  await expect(page.locator('.gif-range-card.is-draft')).toHaveCount(1);
  await seekFrame(page, end);
  await expect.poll(() => progress.inputValue(), { timeout: 10_000 }).not.toBe(end);
  await page.keyboard.press('w');
  await expect(page.locator('.gif-range-card.is-draft .gif-range-details')).toContainText('–');
  await expect(page.locator('[data-command="lock-range"]')).toBeEnabled();
  await page.keyboard.press('a');
  await expect(page.locator('.gif-range-card.is-draft')).toHaveCount(0);
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
    await expect(page.locator('#clipsPanelHost')).toContainText('2 need frames');

    const cards = page.locator('.gif-range-card.is-inexact');
    const firstRangeId = await cards.nth(0).getAttribute('data-range-id');
    const secondRangeId = await cards.nth(1).getAttribute('data-range-id');
    expect(firstRangeId).toBeTruthy();
    expect(secondRangeId).toBeTruthy();

    // Leaving before A discards only staged endpoint replacements.
    await cards.nth(0).getByRole('button', { name: 'Refine range 1' }).click();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('.gif-refinement-workbench')).toBeVisible();
    await expect(page.locator('#clipsPanelHost')).toContainText('2 need frames');
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await expect(page.locator('.gif-range-card')).toHaveCount(2);
    await expect(page.locator('.frame-review-transport [data-command="play-pause"]')).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame');
    await expect(page.locator('[data-command="jump-start"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('q');
    await expect(page.locator('[data-refine-start-value]')).toContainText('Frame');
    await page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`).getByRole('button', { name: 'Refine range 2' }).click();
    await expect(page.locator('[data-refine-range-title]')).toContainText('Range 2');
    await expect(page.locator('.gif-range-card')).toHaveCount(2);
    await page.locator(`.gif-range-card[data-range-id="${firstRangeId}"]`).getByRole('button', { name: 'Refine range 1' }).click();
    await expect(page.locator('[data-refine-range-title]')).toContainText('Range 1');
    await expect(page.locator('[data-refine-start-value]')).toHaveText('Needs exact frame');
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
    await expect(refinedCard).toContainText('Extract');
    await expect(refinedCard.locator('img')).toHaveCount(1);
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toHaveClass(/is-inexact/);
    await expect(page.locator('.gif-range-card')).toHaveCount(2);

    await expect(page.getByRole('button', { name: 'Next inexact clip' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next inexact clip' }).click();
    await expect(page.locator('[data-refine-range-title]')).toContainText('Range 2');
    await expect(page.locator(`.gif-range-card[data-range-id="${secondRangeId}"]`)).toHaveClass(/is-inexact/);
    await expect(page.locator('.frame-review-identity')).toContainText('Frame');
    await expect(page.locator('[data-command="jump-start"]')).toHaveAttribute('aria-pressed', 'true');

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

test('double-click refines an exact capture in place and preserves its earlier extracted clip', async () => {
  test.setTimeout(180_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gif-refine-exact-'));
  const profile = path.join(directory, 'profile');
  const pipelines = path.join(directory, 'pipelines');
  const destination = path.join(pipelines, 'extraction-tmp');
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(pipelines, { recursive: true });
  await fs.writeFile(path.join(profile, 'app-settings.json'), `${JSON.stringify({
    version: 1, pipelinesRootPath: pipelines, singleClipAudioDefault: false,
  })}\n`, 'utf8');
  const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: project, env });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.locator('#appScreenSelector').selectOption('gif-extraction');
    await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
    await page.getByRole('button', { name: 'Open movie...' }).click();
    await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
    await seekFrame(page, '8');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 8');
    await page.keyboard.press('q');
    await seekFrame(page, '23');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 23');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    const card = page.locator('.gif-range-card[data-range-id="range-1"]');
    await expect(card).toHaveClass(/is-exact/);
    await expect(card.getByRole('button', { name: 'Refine range 1' })).toBeVisible();

    await card.locator('.gif-range-details').dblclick();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('[data-refine-start-value]')).toContainText('Frame 8');
    await expect(page.locator('[data-refine-end-value]')).toContainText('Frame 23');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 8');
    await page.locator('[data-command="jump-end"]').click();
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 23');
    await expect(page.locator('[data-refine-end-value]')).toContainText('Frame 23');
    await fs.mkdir(reviewDirectory, { recursive: true });
    await page.screenshot({ path: path.join(reviewDirectory, 'refine-exact-1280.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(card).toContainText('frame 8 – frame 23');
    await expect(page.locator('.gif-range-card')).toHaveCount(1);

    await card.locator('.gif-range-details').dblclick();
    await seekFrame(page, '10');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 10');
    await page.keyboard.press('q');
    await page.keyboard.press('a');
    await expect(page.locator('[data-refine-start-value]')).toContainText('Frame 10');
    await expect(page.locator('.gif-range-card')).toHaveCount(1);
    await expect(card).toHaveClass(/is-exact/);
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await card.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(card.locator('.gif-range-extraction')).toContainText('Extracted as cfr-audio-001.mp4', { timeout: 90_000 });
    expect(existsSync(path.join(destination, 'cfr-audio-001.mp4'))).toBe(true);

    await card.locator('.gif-range-details').dblclick();
    await expect(page.locator('[data-refine-start-value]')).toContainText('Frame 10');
    await page.keyboard.press('a');
    await expect(page.locator('#refineGifScreen .gif-workflow-local-status')).toContainText('Range unchanged');
    await expect(page.locator('[data-command="extract-current"]')).toBeDisabled();
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(card.locator('.gif-range-extraction')).toContainText('cfr-audio-001.mp4');

    await card.locator('.gif-range-details').dblclick();
    await page.locator('[data-command="jump-end"]').click();
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 23');
    await seekFrame(page, '25');
    await expect(page.locator('.frame-review-identity')).toContainText('Frame 25');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await expect(page.locator('#refineGifScreen .gif-workflow-local-status')).toContainText('earlier clip remains saved');
    await expect(page.locator('[data-command="extract-current"]')).toBeEnabled();
    await expect(page.locator('.gif-range-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to GIF Extraction' }).click();
    await expect(card.getByRole('button', { name: 'Extract', exact: true })).toBeEnabled();
    expect(existsSync(path.join(destination, 'cfr-audio-001.mp4'))).toBe(true);
    await card.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(card.locator('.gif-range-extraction')).toContainText('Extracted as cfr-audio-002.mp4', { timeout: 90_000 });
    expect(existsSync(path.join(destination, 'cfr-audio-001.mp4'))).toBe(true);
    expect(existsSync(path.join(destination, 'cfr-audio-002.mp4'))).toBe(true);
    expect(await fs.readFile(path.join(destination, 'cfr-audio.txt'), 'utf8'))
      .toBe('cfr-audio-001.mp4\ncfr-audio-002.mp4\n');

    await seekFrame(page, '30');
    await page.keyboard.press('q');
    await seekFrame(page, '35');
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await expect(page.locator('.gif-range-card')).toHaveCount(2);
    await card.locator('.gif-range-details').dblclick();
    await expect(page.locator('#refineGifScreen')).toBeVisible();
    await expect(page.locator('[data-refine-range-title]')).toContainText('Range 1');
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
