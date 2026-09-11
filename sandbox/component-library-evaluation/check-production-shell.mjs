import { _electron as electron, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve('../..');
const artifacts = resolve('artifacts/production-shell');
await mkdir(artifacts, { recursive: true });
const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [project, `--user-data-dir=${resolve(artifacts, 'profile')}`], cwd: project, env });
try {
  const page = await app.firstWindow();
  await page.locator('#pickBtn').waitFor();
  await page.evaluate(async folder => { await window.clipSandboxDesktop.__testSetNextFolderPath(folder); }, resolve(project, 'tests/e2e/fixtures/video-edit/clips'));
  await page.locator('#pickBtn').click();
  await expect(page.locator('#grid .thumb')).toHaveCount(2);
  await expect.poll(() => page.locator('#grid video').evaluateAll(videos => videos.every(video => video.readyState >= 2))).toBe(true);
  for (const width of [1440, 800]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 900), width);
    await page.waitForTimeout(300);
    await expect(page.locator('#globalAppBar')).toBeVisible();
    await expect(page.locator('#screenCommandHost #pickBtn')).toBeVisible();
    await expect.poll(() => page.locator('#gridWrap').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1)).toBe(true);
    await page.screenshot({ path: resolve(artifacts, `width-${width}.png`) });
  }
  await page.locator('#activityIndicatorBtn').click();
  await expect(page.locator('#activityIndicatorPanel')).toBeVisible();
  await page.screenshot({ path: resolve(artifacts, 'activity.png') });
  await page.locator('#activityIndicatorBtn').click();
  await page.locator('#fsBtn').click();
  await expect(page.locator('#globalAppBar')).toBeHidden();
  await page.screenshot({ path: resolve(artifacts, 'fullscreen.png') });
  await page.keyboard.press('F');
  await expect(page.locator('#globalAppBar')).toBeVisible();
  console.log('Production shell QA passed: two widths, loaded grid, global Activity and fullscreen restore.');
} finally { await app.close(); }
