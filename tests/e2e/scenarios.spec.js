import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { computeFsLayout } from '../../src/app/display-layout-rules.js';

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
  return page.locator('#grid .thumb').evaluateAll((els) => els.filter((el) => el.style.display !== 'none').map((el) => el.dataset.name));
}

async function openOrderMenu(page) {
  await page.click('#orderMenuBtn');
  await expect.poll(async () => page.locator('#orderMenu').getAttribute('data-open')).toBe('true');
}

async function waitForZoomVideo(page) {
  await expect(page.locator('#zoomVideo')).toHaveCount(1);
}

async function openZoomOnFirstClip(page) {
  const first = page.locator('#grid .thumb').first();
  await first.dblclick();
  await expect(page.locator('#zoomOverlay')).toBeVisible();
  await waitForZoomVideo(page);
  return first;
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
    await expect(page.locator('#saveAsNewBtn')).toBeEnabled();
    await expect(page.locator('#grid video')).toHaveCount(2);
  });

  test('shows the implicit collection name in the toolbar and page title', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await expect(page.locator('#activeCollectionName')).toHaveText('clips');
    await expect(page).toHaveTitle('clips collection');
  });
});

test.describe('Filter non-video files', () => {
  test('ignores non-video files in selected folder', async ({ page }) => {
    await loadClips(page, 'load-mixed');
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#count')).toHaveText('2 clips');
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
    await expect(page.locator('#saveAsNewBtn')).toBeDisabled();
  });
});

test.describe('Natural sorting', () => {
  test('loads videos in numeric-aware, case-insensitive filename order', async ({ page }) => {
    await loadClips(page, 'natural-sort');
    await expect.poll(async () => (await getOrder(page)).join('|')).toBe(['item1.mp4', 'Item2.mp4', 'ITEM3.mp4', 'item10.mp4'].join('|'));
  });
});

test.describe('Collection menu interactions', () => {
  test('supports click/tap open and keyboard navigation', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await openOrderMenu(page);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#loadOrderBtn')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#saveBtn')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#saveAsNewBtn')).toBeFocused();
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
    await expect.poll(async () => {
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
    }).toBe(true);

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
    expect(order[2]).toContain('red.mp4');
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
    await expect(page.locator('#gridWrap')).toHaveClass(/titles-hidden/);
    await toggle.click();
    await expect(toggle).toHaveText('Hide Titles');
    await expect(page.locator('#gridWrap')).not.toHaveClass(/titles-hidden/);
  });

  test('restores previous title visibility after fullscreen exit', async ({ page }) => {
    await loadClips(page, 'titles');
    const fsBtn = page.locator('#fsBtn');

    await fsBtn.click();
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(page.locator('#gridWrap')).not.toHaveClass(/titles-hidden/);

    const toggle = page.locator('#toggleTitlesBtn');
    await toggle.click();
    await expect(page.locator('#gridWrap')).toHaveClass(/titles-hidden/);
    await fsBtn.click();
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(page.locator('#gridWrap')).toHaveClass(/titles-hidden/);
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
    await expect.poll(async () => {
      const snapshot = await getFullscreenSnapshot(page);
      const expected = expectedFsState(snapshot, 6);
      return (
        snapshot.hidden === expected.hidden &&
        snapshot.cols === expected.cols &&
        Math.abs(snapshot.sampleH - expected.cellH) < 1
      );
    }).toBe(true);

    const afterSlots = await getFullscreenSnapshot(page);
    const expectedAfterSlots = expectedFsState(afterSlots, 6);
    expect(afterSlots.hidden).toBeGreaterThan(0);
    expect(afterSlots.sampleH).toBeCloseTo(expectedAfterSlots.cellH, 1);

    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
  });
});

test.describe('Collection load', () => {
  test('applies exact-match collection from file', async ({ page }) => {
    await loadClips(page, 'order-valid');
    const collectionFile = path.join(fixtureDir('order-valid'), 'order', 'valid.txt');
    await page.setInputFiles('#orderFileInput', collectionFile);
    await expect.poll(async () => (await getOrder(page)).join('|')).toBe(['three.mp4', 'one.mp4', 'two.webm'].join('|'));
  });

  test('applies subset collection and hides unlisted clips', async ({ page }) => {
    await loadClips(page, 'order-valid');
    const collectionFile = path.join(fixtureDir('order-valid'), 'order', 'subset.txt');
    await page.setInputFiles('#orderFileInput', collectionFile);
    await expect.poll(async () => (await getOrder(page)).join('|')).toBe(['three.mp4', 'one.mp4'].join('|'));
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#count')).toHaveText('2 clips');
    await expect(page.locator('#activeCollectionName')).toHaveText('subset');
    await expect(page).toHaveTitle('subset collection');
  });

  test('shows missing-entry panel and applies existing clips when confirmed', async ({ page }) => {
    await loadClips(page, 'order-invalid');
    const collectionFile = path.join(fixtureDir('order-invalid'), 'order', 'missing-only.txt');
    await page.setInputFiles('#orderFileInput', collectionFile);

    await expect(page.locator('#collectionConflict')).toBeVisible();
    await expect(page.locator('#collectionConflictSummary')).toContainText('1 missing entry');
    await expect(page.locator('#collectionConflictList')).toContainText('missing.mp4');

    await page.click('#applyCollectionConflictBtn');
    await expect(page.locator('#collectionConflict')).toBeHidden();
    await expect.poll(async () => (await getOrder(page)).join('|')).toBe('two.webm');
    await expect(page.locator('#count')).toHaveText('1 clip');
  });

  test('shows missing-entry panel and keeps the current collection when canceled', async ({ page }) => {
    await loadClips(page, 'order-invalid');
    const original = await getOrder(page);
    const collectionFile = path.join(fixtureDir('order-invalid'), 'order', 'missing-only.txt');
    await page.setInputFiles('#orderFileInput', collectionFile);

    await expect(page.locator('#collectionConflict')).toBeVisible();
    await page.click('#cancelCollectionConflictBtn');
    await expect(page.locator('#collectionConflict')).toBeHidden();
    expect(await getOrder(page)).toEqual(original);
  });

  test('shows guidance when loading a collection before a folder', async ({ page }) => {
    await page.goto(appUrl);
    await openOrderMenu(page);
    await page.click('#loadOrderBtn');
    await expect(page.locator('#status')).toHaveText('Load the folder first, then load the collection file.');
  });
});

test.describe('Save collection download fallback', () => {
  test('saves default-collection.txt via download', async ({ page }) => {
    await loadClips(page, 'save-download');
    await openOrderMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#saveBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('default-collection.txt');
    const content = await download.createReadStream();
    const text = (await streamToString(content)).trim();
    expect(text.split('\n')).toEqual(await getOrder(page));
  });

  test('saves only the active subset collection', async ({ page }) => {
    await loadClips(page, 'order-valid');
    const collectionFile = path.join(fixtureDir('order-valid'), 'order', 'subset.txt');
    await page.setInputFiles('#orderFileInput', collectionFile);
    await openOrderMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#saveBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('default-collection.txt');
    const content = await download.createReadStream();
    const text = (await streamToString(content)).trim();
    expect(text.split('\n')).toEqual(['three.mp4', 'one.mp4']);
  });

  test('save as new validates invalid names and downloads a named file', async ({ page }) => {
    await loadClips(page, 'save-download');
    await openOrderMenu(page);
    await page.click('#saveAsNewBtn');
    await expect(page.locator('#saveAsNewDialog')).toBeVisible();

    await page.fill('#saveAsNewNameInput', 'bad:name');
    await page.click('#confirmSaveAsNewBtn');
    await expect(page.locator('#saveAsNewError')).toContainText('cannot contain');
    await expect(page.locator('#saveAsNewDialog')).toBeVisible();

    await page.fill('#saveAsNewNameInput', 'my-cut');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#confirmSaveAsNewBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('my-cut.txt');
    const content = await download.createReadStream();
    const text = (await streamToString(content)).trim();
    expect(text.split('\n')).toEqual(await getOrder(page));
    await expect(page.locator('#saveAsNewDialog')).toBeHidden();
  });
});

test.describe('Save collection direct write path', () => {
  test('writes default-collection.txt to selected folder handle when available', async ({ page }) => {
    await loadClipsViaDirectoryPickerMock(page, [
      { name: 'save-a.mp4', type: 'video/mp4', content: 'a' },
      { name: 'save-b.webm', type: 'video/webm', content: 'b' },
    ]);
    await openOrderMenu(page);
    await page.click('#saveBtn');
    await expect(page.locator('#status')).toHaveText('Saved default-collection.txt to the selected folder.');

    const writes = await page.evaluate(() => window.__savedOrderWrites || []);
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('default-collection.txt');
    expect(writes[0].data.trim().split('\n')).toEqual(await getOrder(page));
  });

  test('save as new writes a named collection file when directory access is available', async ({ page }) => {
    await loadClipsViaDirectoryPickerMock(page, [
      { name: 'save-a.mp4', type: 'video/mp4', content: 'a' },
      { name: 'save-b.webm', type: 'video/webm', content: 'b' },
    ]);
    await openOrderMenu(page);
    await page.click('#saveAsNewBtn');
    await page.fill('#saveAsNewNameInput', 'director-cut');
    await page.click('#confirmSaveAsNewBtn');
    await expect(page.locator('#status')).toHaveText('Saved director-cut.txt to the selected folder.');

    const writes = await page.evaluate(() => window.__savedOrderWrites || []);
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('director-cut.txt');
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

    await expect.poll(async () =>
      page.evaluate((beforeVisible) => {
        const visible = Array.from(document.querySelectorAll('#grid .thumb')).filter((el) => el.style.display !== 'none');
        const firstVideo = visible[0]?.querySelector('video');
        if (firstVideo) firstVideo.dispatchEvent(new Event('ended'));
        const current = visible.map((el) => el.dataset.name);
        return current.join('|') !== beforeVisible.join('|');
      }, before),
      { timeout: 8000 }
    ).toBe(true);
  });
});

test.describe('Zoom demo', () => {
  test('sandbox zoom host opens the sample clip without loading the main app shell', async ({ page }) => {
    await page.goto('/sandbox/zoom-demo.html');
    await expect(page.locator('#viewBtn')).toBeVisible();
    await expect(page.locator('#pickBtn')).toHaveCount(0);
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);

    await page.click('#viewBtn');
    await expect(page.locator('#zoomOverlay')).toBeVisible();
    await expect(page.locator('#zoomFrame')).toBeVisible();
    await expect(page.locator('#zoomVideo')).toHaveAttribute('data-name', 'hand-closes-curtain.mp4');
  });
});
test.describe('Zoom mode', () => {
  test('double-click opens zoom, selects the clip, and keeps the grid rendered', async ({ page }) => {
    await loadClips(page, 'load-basic');
    const first = await openZoomOnFirstClip(page);
    await expect(first).toHaveClass(/selected/);
    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#zoomFrame')).toBeVisible();
  });

  test('pressing Z opens zoom for the selected clip and does nothing without selection', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await page.keyboard.press('Z');
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);

    const first = page.locator('#grid .thumb').first();
    await first.click();
    await page.keyboard.press('Z');
    await expect(page.locator('#zoomOverlay')).toBeVisible();
    await expect(first).toHaveClass(/selected/);
  });

  test('Escape and outside click both close zoom', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await openZoomOnFirstClip(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);

    await openZoomOnFirstClip(page);
    await page.mouse.click(10, 10);
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);
  });

  test('zoomed video is unmuted and restarts from the beginning when reopened', async ({ page }) => {
    await loadClips(page, 'load-basic');
    const first = await openZoomOnFirstClip(page);

    const initialState = await page.evaluate(() => {
      const video = document.getElementById('zoomVideo');
      video.pause();
      const target = Number.isFinite(video.duration) ? Math.min(0.25, Math.max(0.12, video.duration / 2)) : 0.25;
      video.currentTime = target;
      return { muted: video.muted, advancedTime: video.currentTime };
    });
    expect(initialState.muted).toBe(false);
    expect(initialState.advancedTime).toBeGreaterThan(0.1);

    await page.keyboard.press('Escape');
    await first.dblclick();
    await expect(page.locator('#zoomOverlay')).toBeVisible();
    await waitForZoomVideo(page);

    const reopenedTime = await page.evaluate(() => {
      const video = document.getElementById('zoomVideo');
      video.pause();
      return video.currentTime;
    });
    expect(reopenedTime).toBeLessThan(0.1);
  });

  test('entering fullscreen closes zoom first', async ({ page }) => {
    await loadClips(page, 'load-basic');
    await openZoomOnFirstClip(page);
    await page.keyboard.press('F');
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
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






