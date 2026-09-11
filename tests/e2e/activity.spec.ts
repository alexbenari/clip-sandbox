import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Activity retains unresolved errors, copies details, retries a real save failure and navigates overflow', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-activity-'));
  const settingsPath = path.join(profile, 'app-settings.json');
  await fs.mkdir(settingsPath);
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env });
  try {
    const page = await app.firstWindow();
    await page.locator('#settingsBtn').click();
    const pill = page.locator('#activityIndicatorBtn');
    await expect(pill).toHaveAccessibleName('Activity and Errors: 1 unresolved error');
    const before = await page.locator('#keyboardMapBtn').boundingBox();
    // Put a real dialog in front while the filesystem save is pending.
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('#singleClipAudioDefault')!.click();
      document.querySelector<HTMLDialogElement>('#unsavedChangesDialog')!.showModal();
    });
    await expect(pill).toHaveAccessibleName('Activity and Errors: 2 unresolved errors');
    await expect(pill).toHaveText('2 errors');
    await expect(page.locator('#globalUtilityHost')).toBeHidden();
    expect(await page.locator('#keyboardMapBtn').boundingBox()).toEqual(before);
    await page.evaluate(() => document.querySelector<HTMLDialogElement>('#unsavedChangesDialog')!.close());
    await pill.click();
    const panel = page.locator('#activityIndicatorPanel');
    const history = page.getByRole('region', { name: 'Activity history' });
    await expect(panel).toBeVisible();
    await page.screenshot({ path: 'test-results/activity-error.png', animations: 'disabled' });
    const failedSave = page.locator('#activityIndicatorList > li').filter({ hasText: 'Settings were not saved' });
    await failedSave.locator('summary').focus();
    await page.keyboard.press('Space');
    await expect(failedSave.locator('pre')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(failedSave.locator('summary')).toBeFocused();
    const details = await failedSave.locator('pre').innerText();
    await failedSave.getByRole('button', { name: 'Copy details' }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(details);
    await failedSave.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(failedSave).toContainText('Retry failed');
    await expect(page.locator('#singleClipAudioDefault')).not.toBeChecked();
    await fs.rmdir(settingsPath);
    await failedSave.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(failedSave).toContainText('Resolved');
    await expect(pill).toHaveAccessibleName('Activity and Errors: 1 unresolved error');
    await page.screenshot({ path: 'test-results/activity-recovered.png', animations: 'disabled' });
    await expect(page.locator('#singleClipAudioDefault')).toBeChecked();
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await expect(page.locator('#activityIndicatorList > li')).toHaveCount(1);
    await expect(panel).toContainText('Defaults are in use.');
    await page.keyboard.press('Escape');
    // Real successful operations fill the session history without a production-only test hook.
    for (let index = 0; index < 28; index++) {
      await page.locator('#singleClipAudioDefault').click();
      await expect(page.locator('#settingsStatus')).toHaveText('Saved');
    }
    await page.locator('#activityIndicatorBtn').click();
    await expect(history).toBeFocused();
    await expect(page.locator('#activityIndicatorList > li')).toHaveCount(51);
    const rows = page.locator('#activityIndicatorList > li');
    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();
    await expect(rows.last()).toBeInViewport();
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(49)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('PageDown');
    const lower = await history.evaluate(el => el.scrollTop);
    expect(lower).toBeGreaterThan(0);
    await page.keyboard.press('PageUp');
    await expect.poll(() => history.evaluate(el => el.scrollTop)).toBeLessThan(lower);
    await page.keyboard.press('Home');
    await history.hover();
    await page.mouse.wheel(0, 450);
    await expect.poll(() => history.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await history.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650));
    await expect(panel.getByRole('button', { name: 'Clear history', exact: true })).toBeInViewport();
    await page.screenshot({ path: 'test-results/activity-overflow.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await rows.getByRole('button', { name: 'Clear error', exact: true }).click();
    await expect(rows).toHaveCount(0);
    await expect(pill).toHaveAccessibleName('Activity and Errors: Ready');
    await page.keyboard.press('Escape');
    await expect(page.locator('#activityIndicatorBtn')).toBeFocused();
  } finally {
    await app.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});
