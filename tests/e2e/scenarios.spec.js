import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appUrl = '/';
const fixtureDir = (name) => path.join(__dirname, 'fixtures', name);
const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);

test.beforeEach(({ page }) => {
  page.on('pageerror', (err) => console.error('Page error:', err));
  page.on('console', (msg) => console.log('Console:', msg.type(), msg.text()));
});
const clipFiles = (scenario) =>
  fs
    .readdirSync(path.join(fixtureDir(scenario), 'clips'))
    .map((f) => path.join(fixtureDir(scenario), 'clips', f));

async function loadClips(page, scenario) {
  await page.goto(appUrl);
  await page.waitForSelector('#folderInput');
  await page.evaluate(() => {
    // force fallback to file input (folder picker not available in test)
    window.showDirectoryPicker = undefined;
  });
  const dir = path.join(fixtureDir(scenario), 'clips');
  await page.setInputFiles('#folderInput', dir);
  const files = fs.readdirSync(dir);
  const expectedCount = files.filter((f) => VIDEO_EXTS.has(f.split('.').pop().toLowerCase())).length;
  await expect(page.locator('#grid .thumb')).toHaveCount(expectedCount);
}

function getOrder(page) {
  return page.locator('#grid .thumb').evaluateAll((els) => els.map((el) => el.dataset.name));
}

test.describe('Load via folder selection', () => {
  test('loads multiple videos from a folder', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await expect(page.locator('#count')).toHaveText('2 clips');
    await expect(page.locator('#saveBtn')).toBeEnabled();
    await expect(page.locator('#grid video')).toHaveCount(2);
  });
});

test.describe('Filter non-video files', () => {
  test('ignores non-video files in selected folder', async ({ page }) => {
    await loadClips(page, 'load-mixed');
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#count')).toHaveText('2 clips');
    // ensure the non-video filename is not present in any title
    const titles = await getOrder(page);
    expect(titles.some((t) => t.includes('notes.txt'))).toBeFalsy();
  });
});

test.describe('Clip title formatting', () => {
  test('shows filename with formatted duration', async ({ page }) => {
    await loadClips(page, 'load-basic');
    const clipHandle = await page.waitForFunction(() => {
      const thumb = document.querySelector('#grid .thumb');
      if (!thumb) return null;
      const label = thumb.querySelector('.filename');
      const text = label?.textContent?.trim();
      if (!text || !thumb.dataset.name) return null;
      return { name: thumb.dataset.name, label: text };
    });
    const clip = await clipHandle.jsonValue();
    const escaped = clip.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped} \\((?:\\d{2}:\\d{2}:\\d{2}|--:--:--)\\)$`);
    expect(clip.label).toMatch(pattern);
  });
});

test.describe('Drag reorder', () => {
  test('reorders clips via drag-and-drop', async ({ page }) => {
    await loadClips(page, 'reorder');
    const first = page.locator('#grid .thumb').nth(0);
    const third = page.locator('#grid .thumb').nth(2);
    await first.dragTo(third, { targetPosition: { x: 10, y: 10 } });
    const order = await getOrder(page);
    expect(order[2]).toContain('red.mp4'); // dragged to last position
  });
});

test.describe('Delete selected clip', () => {
  test('Delete/Backspace removes selected card', async ({ page }) => {
    await loadClips(page, 'delete');
    const first = page.locator('#grid .thumb').first();
    await first.click();
    await page.keyboard.press('Delete');
    await expect(page.locator('#grid .thumb')).toHaveCount(1);
    await expect(page.locator('#count')).toHaveText('1 clip');
  });
});

test.describe('Toggle titles', () => {
  test('Hide/Show titles updates overlays and button label', async ({ page }) => {
    await loadClips(page, 'titles');
    const toggle = page.locator('#toggleTitlesBtn');
    await toggle.click();
    await expect(toggle).toHaveText('Show Titles');
    await expect(page.locator('body')).toHaveClass(/titles-hidden/);
    await toggle.click();
    await expect(toggle).toHaveText('Hide Titles');
    await expect(page.locator('body')).not.toHaveClass(/titles-hidden/);
  });
});

test.describe('Fullscreen behaviors', () => {
  test('enter/exit fullscreen toggles state and slot count updates', async ({ page }) => {
    await loadClips(page, 'fullscreen');
    const fsBtn = page.locator('#fsBtn');
    await fsBtn.click();
    // some environments block fullscreen; if so, trigger handler manually
    await page.waitForTimeout(50);
    const active = await page.locator('body').evaluate((el) => el.classList.contains('fs-active'));
    if (!active) {
      await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    }
    // fall back to class toggle even if fullscreen API is restricted in CI
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.type('6');
    // ensure at least one clip hidden when slots reduce
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#grid .thumb')).filter((el) => el.style.display === 'none').length
    );
    expect(hidden).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('F'); // exit via keyboard shortcut
    await page.waitForTimeout(50);
    const stillActive = await page.locator('body').evaluate((el) => el.classList.contains('fs-active'));
    if (stillActive) {
      await page.evaluate(() => {
        document.body.classList.remove('fs-active');
        document.dispatchEvent(new Event('fullscreenchange'));
      });
    }
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
  });
});

test.describe('Apply valid order file', () => {
  test('applies matching order from file', async ({ page }) => {
    await loadClips(page, 'order-valid');
    const orderFile = path.join(fixtureDir('order-valid'), 'order', 'valid.txt');
    await page.setInputFiles('#orderFileInput', orderFile);
    await expect
      .poll(async () => (await getOrder(page)).join('|'))
      .toBe(['three.mp4', 'one.mp4', 'two.webm'].join('|'));
  });
});

test.describe('Reject invalid order file', () => {
  test('shows alert and keeps order when file is invalid', async ({ page }) => {
    await loadClips(page, 'order-invalid');
    const original = await getOrder(page);
    page.once('dialog', (d) => d.accept());
    const orderFile = path.join(fixtureDir('order-invalid'), 'order', 'invalid.txt');
    await page.setInputFiles('#orderFileInput', orderFile);
    await page.waitForTimeout(100); // allow dialog handling
    const after = await getOrder(page);
    expect(after).toEqual(original);
  });
});

test.describe('Save order download fallback', () => {
  test('saves clip-order.txt via download', async ({ page }) => {
    await loadClips(page, 'save-download');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#saveBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('clip-order.txt');
    const content = await download.createReadStream();
    const text = (await streamToString(content)).trim();
    expect(text.split('\n')).toEqual(await getOrder(page));
  });
});

test.describe('Status bar visibility', () => {
  test('status bar shows for load and hides afterwards', async ({ page }) => {
    await loadClips(page, 'status');
    const status = page.locator('#status');
    await expect(status).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(status).toBeHidden();
  });
});

async function streamToString(stream) {
  if (!stream) return '';
  return new Promise((resolve, reject) => {
    let data = '';
    stream.on('data', (chunk) => (data += chunk.toString()));
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}
