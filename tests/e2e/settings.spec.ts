import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test('settings survive restart without replacing the working collection and govern new Zoom audio', async () => {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'clip-settings-e2e-'));
  const clips = path.resolve('tests/e2e/fixtures/video-edit/clips');
  const chosenRoot = path.join(profile, 'יצירה clips');
  await fsp.mkdir(chosenRoot);
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const setNextFolder = async (folder: string) => {
      await page.evaluate(async next => {
        await (window as any).clipSandboxDesktop.__testSetNextFolderPath(next);
      }, folder);
    };
    await setNextFolder(clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    const names = await page.locator('#grid .thumb').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.name));
    await page.locator('#grid .thumb').first().click();
    const selected = await page.locator('#grid .thumb.selected').getAttribute('data-name');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsScreen')).toBeVisible();
    await expect(page.locator('#screenCommandHost')).toBeHidden();
    await expect(page.locator('#pipelinesRootPath')).toBeFocused();
    await expect(page.locator('#singleClipAudioDefault')).not.toBeChecked();
    await setNextFolder(chosenRoot);
    await page.locator('#choosePipelinesRoot').click();
    await expect(page.locator('#pipelinesRootPath')).toHaveValue(chosenRoot);
    await page.locator('#singleClipAudioDefault').check();
    await expect(page.locator('#settingsStatus')).toHaveText('Saved');
    await expect(page.locator('#singleClipAudioDefault')).toBeChecked();
    await page.screenshot({ path: 'test-results/settings-desktop.png' });
    await page.locator('#appScreenSelector').selectOption('collection');
    await expect(page.locator('#toolbar')).toBeVisible();
    expect(await page.locator('#grid .thumb').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.name))).toEqual(names);
    await expect(page.locator('#grid .thumb.selected')).toHaveAttribute('data-name', selected!);
    expect(await page.locator('#grid video').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => (node as HTMLVideoElement).muted))).toBe(true);
    await page.locator('#grid .thumb').first().dblclick();
    await expect(page.locator('#zoomVideo')).toHaveJSProperty('muted', false);
    await page.locator('#appScreenSelector').selectOption('settings');
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);
    await expect(page.locator('#settingsScreen')).toBeVisible();
    await page.locator('#choosePipelinesRoot').focus();
    await page.keyboard.press('f');
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#pipelinesRootPath')).toHaveValue(chosenRoot);
    await expect(page.locator('#singleClipAudioDefault')).toBeChecked();
    await page.locator('#appScreenSelector').selectOption('collection');
    await setNextFolder(clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await page.locator('#grid .thumb').first().dblclick();
    await expect(page.locator('#zoomVideo')).toHaveJSProperty('muted', false);
    await page.keyboard.press('Escape');
    await page.locator('#settingsBtn').click();
    await page.locator('#singleClipAudioDefault').uncheck();
    await expect(page.locator('#settingsStatus')).toHaveText('Saved');
    await page.locator('#appScreenSelector').selectOption('collection');
    await page.locator('#grid .thumb').first().dblclick();
    await expect(page.locator('#zoomVideo')).toHaveJSProperty('muted', true);
  } finally {
    await app.close();
    await fsp.rm(profile, { recursive: true, force: true });
  }
});

test('unreadable settings report defaults and a failed save can be retried', async () => {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'clip-settings-failure-'));
  const settingsPath = path.join(profile, 'app-settings.json');
  await fsp.mkdir(settingsPath);
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  try {
    const page = await app.firstWindow();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsStatus')).toContainText('Defaults are in use.');
    await expect(page.locator('#singleClipAudioDefault')).not.toBeChecked();
    await page.locator('#singleClipAudioDefault').click();
    await expect(page.locator('#settingsStatus')).toContainText('Settings were not saved');
    await expect(page.locator('#singleClipAudioDefault')).not.toBeChecked();
    await expect(page.locator('#activityIndicatorPanel')).toBeVisible();
    await expect(page.locator('#activityIndicatorList')).toContainText('Settings were not saved');
    await page.locator('#activityIndicatorBtn').click();
    await fsp.rmdir(settingsPath);
    await page.locator('#singleClipAudioDefault').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#settingsStatus')).toHaveText('Saved');
    await expect(page.locator('#singleClipAudioDefault')).toBeChecked();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650));
    await expect(page.locator('#choosePipelinesRoot')).toBeInViewport();
    await page.screenshot({ path: 'test-results/settings-narrow.png' });
  } finally {
    await app.close();
    await fsp.rm(profile, { recursive: true, force: true });
  }
});
