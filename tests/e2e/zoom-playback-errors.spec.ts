import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Zoom reports damaged media once while rapid healthy close/reopen stays quiet', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-playback-errors-'));
  const clips = path.join(directory, 'clips');
  await fs.mkdir(clips);
  await fs.writeFile(path.join(clips, 'damaged.mp4'), 'Invalid media fixture');
  await fs.copyFile('tests/e2e/fixtures/video-edit/clips/source.mp4', path.join(clips, 'source.mp4'));
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    await page.locator('#pickBtn').waitFor();
    await page.evaluate(folder => Reflect.get(window, 'clipSandboxDesktop').__testSetNextFolderPath(folder), clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    for (let index = 0; index < 5; index++) {
      await page.locator('#grid .thumb[data-name="source.mp4"]').dblclick();
      await page.keyboard.press('Escape');
      await expect(page.locator('#zoomVideo')).toHaveCount(0);
    }
    await expect(page.locator('#activityIndicatorList [data-state="error"]')).toHaveCount(0);
    await page.locator('#grid .thumb[data-name="damaged.mp4"]').dblclick();
    await expect(page.locator('#activityIndicatorBtn')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#activityIndicatorList [data-state="error"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    if (await page.locator('#activityIndicatorPanel').isHidden()) await page.locator('#activityIndicatorBtn').click();
    await expect(page.locator('#activityIndicatorList')).toContainText('Could not play damaged.mp4 in Zoom.');
    await expect(page.locator('#activityIndicatorList')).toContainText('Close and reopen the clip');
    await expect.poll(async () => (await fs.readFile(path.join(clips, 'err.log'), 'utf8')).includes('Could not play damaged.mp4 in Zoom.')).toBe(true);
    await page.screenshot({ path: 'test-results/zoom-playback-error.png' });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
