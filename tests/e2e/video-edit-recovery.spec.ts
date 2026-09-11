import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('created edit survives a UI callback failure and editing becomes available again', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-edit-recovery-'));
  const clips = path.join(directory, 'clips');
  await fs.mkdir(clips);
  await fs.copyFile('tests/e2e/fixtures/video-edit/clips/source.mp4', path.join(clips, 'source.mp4'));
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    await page.locator('#pickBtn').waitFor();
    await page.evaluate(async folder => {
      const desktop = Reflect.get(window, 'clipSandboxDesktop');
      await desktop.__testSetNextFolderPath(folder);
    }, clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(1);
    await page.locator('#grid .thumb').dblclick();
    // Fault injection at the public adapter conversion boundary, after loading the source.
    await page.evaluate(async () => {
      const modulePath = './build/src/adapters/electron/electron-file-system-service.js';
      const { ElectronFileSystemService } = await import(modulePath);
      const original = ElectronFileSystemService.prototype.toRendererFile;
      ElectronFileSystemService.prototype.toRendererFile = function () {
        ElectronFileSystemService.prototype.toRendererFile = original;
        throw new Error('Injected output refresh failure');
      };
    });
    await page.locator('#zoomVideo').click({ button: 'right' });
    await page.locator('[data-item-id="zoom-edit-loopify"]').click();
    await expect(page.locator('#activityIndicatorBtn')).toHaveAttribute('data-state', 'error');
    await page.keyboard.press('Escape');
    if (await page.locator('#activityIndicatorPanel').isHidden()) await page.locator('#activityIndicatorBtn').click();
    await expect(page.locator('#activityIndicatorList')).toContainText('output clip was created');
    const files = await fs.readdir(clips);
    expect(files.filter(name => name.endsWith('.mp4'))).toHaveLength(2);
    await page.screenshot({ path: 'test-results/edit-callback-recovery.png' });
    await page.keyboard.press('Escape');
    await page.locator('#grid .thumb').first().dblclick();
    await page.locator('#zoomVideo').click({ button: 'right' });
    await expect(page.locator('[data-item-id="zoom-edit-loopify"]')).not.toHaveAttribute('aria-disabled', 'true');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
