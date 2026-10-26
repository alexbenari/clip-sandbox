import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { launchApp, openActivity, resizeContent } from './support/app.js';

type ActivityProfile = { app: ElectronApplication; page: Page; settingsPath: string };

// A folder where the settings file belongs makes settings unreadable and every save fail.
async function withUnwritableSettings(run: (profile: ActivityProfile) => Promise<void>): Promise<void> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-activity-'));
  const settingsPath = path.join(profile, 'app-settings.json');
  await fs.mkdir(settingsPath);
  const app = await launchApp(profile);
  try {
    const page = await app.firstWindow();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and errors: 1 unresolved error');
    await run({ app, page, settingsPath });
  } finally {
    await app.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

// With no dialog open, the new error opens Activity by itself.
async function failSettingsSaveIntoOpenActivity(page: Page): Promise<void> {
  await page.locator('#singleClipAudioDefault').click();
  await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and errors: 2 unresolved errors');
  await expect(page.locator('#activityIndicatorPanel')).toBeVisible();
}

const failedSaveEntry = (page: Page) => page.locator('#activityIndicatorList > li').filter({ hasText: 'Settings were not saved' });

async function makeSettingsWritable(settingsPath: string): Promise<void> {
  await fs.rmdir(settingsPath);
}

// Real successful saves fill the history until it overflows, without a production-only test hook.
async function fillHistoryUntilItOverflows(page: Page): Promise<void> {
  const history = page.getByRole('region', { name: 'Activity history' });
  const historyOverflows = async () => {
    await page.locator('#activityIndicatorBtn').click();
    const overflowing = await history.evaluate(el => el.scrollHeight > el.clientHeight * 2);
    await page.keyboard.press('Escape');
    return overflowing;
  };
  for (let saves = 0; !(await historyOverflows()); saves++) {
    expect(saves, 'saves needed before the Activity history overflows').toBeLessThan(60);
    await page.locator('#singleClipAudioDefault').click();
    await expect(page.locator('#settingsStatus')).toHaveText('Saved');
  }
}

test('a save failure behind an open dialog adds an unresolved error without moving the app bar', async () => {
  await withUnwritableSettings(async ({ page }) => {
    const pill = page.locator('#activityIndicatorBtn');
    const before = await page.locator('#keyboardMapBtn').boundingBox();

    // Put a real dialog in front while the filesystem save is pending.
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('#singleClipAudioDefault')!.click();
      document.querySelector<HTMLDialogElement>('#unsavedChangesDialog')!.showModal();
    });

    await expect(pill).toHaveAccessibleName('Activity and errors: 2 unresolved errors');
    await expect(pill).toHaveText('2 errors');
    await expect(page.locator('#globalUtilityHost')).toBeHidden();
    const after = await page.locator('#keyboardMapBtn').boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
    expect(Math.abs(after!.width - before!.width)).toBeLessThan(1);
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
  });
});

test('Activity error details open from the keyboard and can be copied', async () => {
  await withUnwritableSettings(async ({ page }) => {
    await failSettingsSaveIntoOpenActivity(page);
    const moreDetails = failedSaveEntry(page).getByRole('button', { name: 'More details', exact: true });
    await expect(page.locator('#activityIndicatorPanel').getByRole('button', { name: 'More details', exact: true })).toHaveCount(2);

    await moreDetails.focus();
    await page.keyboard.press('Space');
    await expect(moreDetails).toHaveAttribute('aria-expanded', 'true');
    await expect(failedSaveEntry(page).locator('pre')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(failedSaveEntry(page).locator('summary')).toBeFocused();
    await expect(failedSaveEntry(page).locator('pre')).toHaveText(/\S/);
    await failedSaveEntry(page).getByRole('button', { name: 'Copy details' }).click();

    // Headless Windows runners can report an empty OS clipboard after a successful write.
    await expect(failedSaveEntry(page)).toContainText('Technical details copied.');
  });
});

test('retrying a failed settings save resolves its error once saving works', async () => {
  await withUnwritableSettings(async ({ page, settingsPath }) => {
    await failSettingsSaveIntoOpenActivity(page);
    const retry = failedSaveEntry(page).getByRole('button', { name: 'Retry', exact: true });

    await retry.click();
    await expect(failedSaveEntry(page)).toContainText('Retry failed');
    await expect(page.locator('#singleClipAudioDefault')).not.toBeChecked();
    await makeSettingsWritable(settingsPath);
    await retry.click();

    await expect(failedSaveEntry(page)).toContainText('Resolved');
    await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and errors: 1 unresolved error');
    await expect(page.locator('#singleClipAudioDefault')).toBeChecked();
  });
});

test('Clear history removes finished entries and keeps unresolved errors', async () => {
  await withUnwritableSettings(async ({ page, settingsPath }) => {
    await makeSettingsWritable(settingsPath);
    await page.locator('#singleClipAudioDefault').click();
    await expect(page.locator('#settingsStatus')).toHaveText('Saved');
    await openActivity(page);
    const rows = page.locator('#activityIndicatorList > li');
    await expect(rows).not.toHaveCount(1);

    await page.getByRole('button', { name: 'Clear history', exact: true }).click();

    await expect(rows).toHaveCount(1);
    await expect(page.locator('#activityIndicatorPanel')).toContainText('Defaults are in use.');
  });
});

test('a long Activity history moves focus by keyboard and scrolls by keyboard and wheel', async () => {
  await withUnwritableSettings(async ({ page, settingsPath }) => {
    await makeSettingsWritable(settingsPath);
    await fillHistoryUntilItOverflows(page);
    const history = page.getByRole('region', { name: 'Activity history' });
    const rows = page.locator('#activityIndicatorList > li');

    await page.locator('#activityIndicatorBtn').click();
    await expect(history).toBeFocused();
    const rowCount = await rows.count();
    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();
    await expect(rows.last()).toBeInViewport();
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(rowCount - 2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect.poll(() => history.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const lower = await history.evaluate(el => el.scrollTop);
    await page.keyboard.press('PageUp');
    await expect.poll(() => history.evaluate(el => el.scrollTop)).toBeLessThan(lower);
    await page.keyboard.press('Home');
    await history.hover();
    await page.mouse.wheel(0, 450);

    await expect.poll(() => history.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  });
});

test('Clear history stays reachable for a long history in a small window', async () => {
  await withUnwritableSettings(async ({ app, page, settingsPath }) => {
    await makeSettingsWritable(settingsPath);
    await fillHistoryUntilItOverflows(page);
    await openActivity(page);

    await resizeContent(app, page, 900, 650);

    await expect(page.locator('#activityIndicatorPanel').getByRole('button', { name: 'Clear history', exact: true })).toBeInViewport();
  });
});

test('clearing the last error returns Activity to Ready', async () => {
  await withUnwritableSettings(async ({ page }) => {
    await openActivity(page);
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    const rows = page.locator('#activityIndicatorList > li');
    await expect(rows).toHaveCount(1);

    await rows.getByRole('button', { name: 'Clear error', exact: true }).click();

    await expect(rows).toHaveCount(0);
    await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and errors: Ready');
  });
});
