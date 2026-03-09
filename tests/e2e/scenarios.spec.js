import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { computeFsLayout } from '../../src/domain/layout-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appUrl = '/';
const fixtureDir = (name) => path.join(__dirname, 'fixtures', name);
const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);

test.beforeEach(({ page }) => {
  page.on('pageerror', (err) => console.error('Page error:', err));
  page.on('console', (msg) => console.log('Console:', msg.type(), msg.text()));
});

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

async function loadClipsViaDirectoryPickerMock(page, files) {
  await page.goto(appUrl);
  await page.waitForSelector('#pickBtn');
  await page.evaluate((mockFiles) => {
    window.__savedOrderWrites = [];
    const toFile = (f) => new File([f.content || f.name], f.name, { type: f.type || '' });
    window.showDirectoryPicker = async () => ({
      kind: 'directory',
      async *values() {
        for (const f of mockFiles) {
          yield {
            kind: 'file',
            async getFile() {
              return toFile(f);
            },
          };
        }
      },
      async getFileHandle(name, options = {}) {
        return {
          async createWritable() {
            let data = '';
            return {
              async write(chunk) {
                data += typeof chunk === 'string' ? chunk : String(chunk);
              },
              async close() {
                window.__savedOrderWrites.push({ name, data, create: !!options.create });
              },
            };
          },
        };
      },
    });
  }, files);
  await page.click('#pickBtn');
  await expect(page.locator('#grid .thumb')).toHaveCount(files.length);
}

function getOrder(page) {
  return page.locator('#grid .thumb').evaluateAll((els) => els.map((el) => el.dataset.name));
}

function getVisibleOrder(page) {
  return page
    .locator('#grid .thumb')
      .evaluateAll((els) => els.filter((el) => el.style.display !== 'none').map((el) => el.dataset.name));
}

async function openOrderMenu(page, method = 'click') {
  if (method === 'hover') {
    await page.hover('#orderMenuBtn');
    await expect
      .poll(async () =>
        page.locator('#orderMenuPanel').evaluate((el) => {
          const style = window.getComputedStyle(el);
          return style.pointerEvents !== 'none' && parseFloat(style.opacity || '0') > 0 && el.getBoundingClientRect().height > 0;
        })
      )
      .toBe(true);
    return;
  } else if (method === 'keyboard') {
    await page.focus('#orderMenuBtn');
    await page.keyboard.press('Enter');
  } else {
    await page.click('#orderMenuBtn');
  }
  await expect.poll(async () => page.locator('#orderMenu').getAttribute('data-open')).toBe('true');
}

async function getFullscreenSnapshot(page) {
  return page.evaluate(() => {
    const grid = document.getElementById('grid');
    const gridWrap = document.getElementById('gridWrap');
    const thumbs = Array.from(document.querySelectorAll('#grid .thumb'));
    const colsMatch = (grid?.style.gridTemplateColumns || '').match(/repeat\((\d+),\s*1fr\)/);
    return {
      gap: parseFloat(getComputedStyle(grid).gap) || 0,
      availW: gridWrap.clientWidth,
      availH: window.innerHeight - 28,
      total: thumbs.length,
      hidden: thumbs.filter((el) => el.style.display === 'none').length,
      sampleH: thumbs.length ? parseFloat(thumbs[0].style.height) : 0,
      cols: colsMatch ? Number(colsMatch[1]) : 1,
    };
  });
}

function expectedFsState(snapshot, slots) {
  const layout = computeFsLayout({
    slots,
    availW: snapshot.availW,
    availH: snapshot.availH,
    gap: snapshot.gap,
  });
  const visible = Math.max(1, Math.min(snapshot.total, layout.targetVisible));
  const hidden = Math.max(0, snapshot.total - visible);
  return { cols: layout.cols, cellH: layout.cellH, hidden };
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

test.describe('No supported videos', () => {
  test('keeps grid empty when folder has no supported videos', async ({ page }) => {
    await loadClips(page, 'no-video');
    await expect(page.locator('#grid .thumb')).toHaveCount(0);
    await expect(page.locator('#count')).toHaveText('0 clips');
    await expect(page.locator('#saveBtn')).toBeDisabled();
  });
});

test.describe('Natural sorting', () => {
  test('loads videos in numeric-aware, case-insensitive filename order', async ({ page }) => {
    await loadClips(page, 'natural-sort');
    await expect
      .poll(async () => (await getOrder(page)).join('|'))
      .toBe(['item1.mp4', 'Item2.mp4', 'ITEM3.mp4', 'item10.mp4'].join('|'));
  });
});

test.describe('Order menu interactions', () => {
  test('opens on hover and closes on mouse leave', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await openOrderMenu(page, 'hover');
    await page.mouse.move(5, 5);
    await expect
      .poll(async () =>
        page.locator('#orderMenuPanel').evaluate((el) => {
          const style = window.getComputedStyle(el);
          return style.pointerEvents !== 'none' && parseFloat(style.opacity || '0') > 0 && el.getBoundingClientRect().height > 0;
        })
      )
      .toBe(false);
  });

  test('supports click/tap open and keyboard navigation', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await openOrderMenu(page, 'click');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#saveBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.locator('#orderMenu').getAttribute('data-open')).toBe('false');
    await expect(page.locator('#orderMenuBtn')).toBeFocused();
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

test.describe('Responsive grid layout', () => {
  test('recomputes grid layout when viewport size changes', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await loadClips(page, 'fullscreen-many');
    const initial = await page.evaluate(() => {
      const grid = document.getElementById('grid');
      const card = document.querySelector('#grid .thumb');
      const colsMatch = (grid?.style.gridTemplateColumns || '').match(/repeat\((\d+),\s*1fr\)/);
      return {
        cols: colsMatch ? Number(colsMatch[1]) : 1,
        h: card ? parseFloat(card.style.height) : 0,
      };
    });

    await page.setViewportSize({ width: 720, height: 900 });
    await expect
      .poll(async () => {
        const next = await page.evaluate(() => {
          const grid = document.getElementById('grid');
          const card = document.querySelector('#grid .thumb');
          const colsMatch = (grid?.style.gridTemplateColumns || '').match(/repeat\((\d+),\s*1fr\)/);
          return {
            cols: colsMatch ? Number(colsMatch[1]) : 1,
            h: card ? parseFloat(card.style.height) : 0,
          };
        });
        return next.cols !== initial.cols || Math.abs(next.h - initial.h) > 1;
      })
      .toBe(true);

    await page.setViewportSize({ width: 360, height: 260 });
    const tiny = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#grid .thumb'));
      return cards.every((el) => Number.isFinite(parseFloat(el.style.height)) && parseFloat(el.style.height) > 0);
    });
    expect(tiny).toBe(true);
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

  test('does not remove selected card while typing in an input', async ({ page }) => {
    await loadClips(page, 'delete');
    const first = page.locator('#grid .thumb').first();
    await first.click();

    await page.evaluate(() => {
      let input = document.getElementById('scratch-input');
      if (!input) {
        input = document.createElement('input');
        input.id = 'scratch-input';
        input.type = 'text';
        input.value = 'abc';
        input.style.position = 'fixed';
        input.style.top = '12px';
        input.style.left = '12px';
        input.style.zIndex = '9999';
        document.body.appendChild(input);
      }
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

    await page.keyboard.press('Backspace');
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
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

  test('restores previous title visibility after fullscreen exit', async ({ page }) => {
    await loadClips(page, 'titles');
    const fsBtn = page.locator('#fsBtn');

    // Default titles visible -> should still be visible after fullscreen exit.
    await fsBtn.click();
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(page.locator('body')).not.toHaveClass(/titles-hidden/);

    // Hidden titles before fullscreen -> should remain hidden after exit.
    const toggle = page.locator('#toggleTitlesBtn');
    await toggle.click();
    await expect(page.locator('body')).toHaveClass(/titles-hidden/);
    await fsBtn.click();
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(page.locator('body')).toHaveClass(/titles-hidden/);
  });
});

test.describe('Fullscreen behaviors', () => {
  test('enforces fullscreen slot layout and keeps it stable', async ({ page }) => {
    await loadClips(page, 'fullscreen-many');
    const fsBtn = page.locator('#fsBtn');
    await fsBtn.click();

    await expect.poll(async () => page.locator('body').evaluate((el) => el.classList.contains('fs-active'))).toBe(true);

    const defaultSnapshot = await getFullscreenSnapshot(page);
    const expectedDefault = expectedFsState(defaultSnapshot, 12);
    expect(defaultSnapshot.hidden).toBe(expectedDefault.hidden);
    expect(defaultSnapshot.cols).toBe(expectedDefault.cols);
    expect(defaultSnapshot.sampleH).toBeCloseTo(expectedDefault.cellH, 1);

    await page.keyboard.type('6');
    await expect
      .poll(async () => {
        const snapshot = await getFullscreenSnapshot(page);
        const expected = expectedFsState(snapshot, 6);
        return (
          snapshot.hidden === expected.hidden &&
          snapshot.cols === expected.cols &&
          Math.abs(snapshot.sampleH - expected.cellH) < 1
        );
      })
      .toBe(true);

    const afterSlots = await getFullscreenSnapshot(page);
    const expectedAfterSlots = expectedFsState(afterSlots, 6);
    expect(afterSlots.hidden).toBeGreaterThan(0);
    expect(afterSlots.sampleH).toBeCloseTo(expectedAfterSlots.cellH, 1);

    await page.keyboard.press('F'); // exit via keyboard shortcut
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
    const dialogPromise = page.waitForEvent('dialog', { timeout: 1500 });
    const orderFile = path.join(fixtureDir('order-invalid'), 'order', 'invalid.txt');
    await page.setInputFiles('#orderFileInput', orderFile);
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('alert');
    expect(dialog.message()).toContain('Could not apply order');
    await dialog.accept();
    const after = await getOrder(page);
    expect(after).toEqual(original);
  });
});

test.describe('Save order download fallback', () => {
  test('saves clip-order.txt via download', async ({ page }) => {
    await loadClips(page, 'save-download');
    await openOrderMenu(page, 'click');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#saveBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('clip-order.txt');
    const content = await download.createReadStream();
    const text = (await streamToString(content)).trim();
    expect(text.split('\n')).toEqual(await getOrder(page));
  });
});

test.describe('Save order direct write path', () => {
  test('writes clip-order.txt to selected folder handle when available', async ({ page }) => {
    await loadClipsViaDirectoryPickerMock(page, [
      { name: 'save-a.mp4', type: 'video/mp4', content: 'a' },
      { name: 'save-b.webm', type: 'video/webm', content: 'b' },
    ]);
    await openOrderMenu(page, 'click');
    await page.click('#saveBtn');
    await expect(page.locator('#status')).toHaveText('Saved clip-order.txt to the selected folder.');

    const writes = await page.evaluate(() => window.__savedOrderWrites || []);
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('clip-order.txt');
    expect(writes[0].data.trim().split('\n')).toEqual(await getOrder(page));
  });
});

test.describe('Status bar visibility', () => {
  test('status bar shows for load and hides afterwards', async ({ page }) => {
    await loadClips(page, 'status');
    const status = page.locator('#status');
    await expect(status).toBeVisible();
    await expect.poll(async () => status.isHidden(), { timeout: 4000 }).toBe(true);
  });
});

test.describe('Fullscreen clip rotation', () => {
  test('rotates a hidden clip into visible slots over time', async ({ page }) => {
    await loadClips(page, 'fullscreen-many');
    await page.evaluate(() => {
      const originalSetInterval = window.setInterval.bind(window);
      window.Math.random = () => 0;
      window.setInterval = (fn, _ms, ...args) => originalSetInterval(fn, 120, ...args);
    });

    await page.click('#fsBtn');
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    const before = await getVisibleOrder(page);

    await expect
      .poll(
        async () =>
          page.evaluate((beforeVisible) => {
            const visible = Array.from(document.querySelectorAll('#grid .thumb')).filter((el) => el.style.display !== 'none');
            const firstVideo = visible[0]?.querySelector('video');
            if (firstVideo) firstVideo.dispatchEvent(new Event('ended'));
            const current = visible.map((el) => el.dataset.name);
            return current.join('|') !== beforeVisible.join('|');
          }, before),
        { timeout: 8000 }
      )
      .toBe(true);
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
