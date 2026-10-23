// @ts-nocheck
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

import { launchApp as launchElectronApp, resizeContent } from './support/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, 'fixtures');

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }
    await fsp.copyFile(srcPath, destPath);
  }
}

async function createScenarioFolder(name) {
  const sourceDir = path.join(fixturesRoot, name, 'clips');
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `clip-sandbox-${name}-`));
  const folderPath = path.join(tempRoot, 'clips');
  await copyDir(sourceDir, folderPath);
  return { tempRoot, folderPath };
}

async function launchApp(profilePath) {
  const electronApp = await launchElectronApp(profilePath);
  const page = await electronApp.firstWindow();
  await page.locator('#appScreenSelector').selectOption('collection');
  await expect(page.locator('#pickBtn')).toBeVisible();
  return { electronApp, page };
}

async function closeApp(electronApp) {
  if (!electronApp) return;
  await electronApp.close();
}

async function removeTempRoot(tempRoot) {
  if (!tempRoot) return;
  await fsp.rm(tempRoot, { recursive: true, force: true });
}

async function setNextFolder(page, folderPath) {
  await page.evaluate(async (nextFolderPath) => {
    await window.clipSandboxDesktop.__testSetNextFolderPath(nextFolderPath);
  }, folderPath);
}

async function loadFolder(page, folderPath) {
  await setNextFolder(page, folderPath);
  await page.locator('#pickBtn').click();
}

async function allClipNames(page) {
  return page.locator('#grid .thumb').evaluateAll((els) => els.map((el) => el.dataset.name));
}

function collectionFileLines(text) {
  return String(text || '').trim().replace(/\r/g, '').split('\n').filter(Boolean);
}

async function openOrderMenu(page) {
  await page.locator('#orderMenuBtn').click();
  await expect(page.locator('#orderMenu')).toHaveAttribute('data-open', 'true');
}

const PICTURE_FILLS_CARD_ON_BLACK = { scaledUp: true, touchesCardEdges: true, keepsProportions: true, background: 'rgb(0, 0, 0)' };

// The picture a contained video draws is its intrinsic size scaled to fit the element's box.
async function firstCardPictureFit(page) {
  return page.locator('#grid .thumb').first().evaluate(card => {
    const video = card.querySelector('video');
    if (!video?.videoWidth) return null;
    const box = video.getBoundingClientRect();
    const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    const pictureWidth = video.videoWidth * scale;
    const pictureHeight = video.videoHeight * scale;
    const style = getComputedStyle(video);
    return {
      scaledUp: scale > 1,
      touchesCardEdges: Math.min(card.clientWidth - pictureWidth, card.clientHeight - pictureHeight) <= 1,
      keepsProportions: style.objectFit === 'contain',
      background: style.backgroundColor,
    };
  });
}

async function openActivityPanel(page) {
  const panel = page.locator('#activityIndicatorPanel');
  if (await panel.isHidden()) {
    await page.locator('#activityIndicatorBtn').click();
  }
  await expect(panel).toBeVisible();
}

test.describe('Collection workflows', () => {
  let electronApp;
  let page;
  let tempRoot;
  let folderPath;
  let profilePath;

  test.beforeEach(async () => {
    profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-scenario-profile-'));
    ({ electronApp, page } = await launchApp(profilePath));
  });

  test.afterEach(async () => {
    await closeApp(electronApp);
    electronApp = null;
    page = null;
    await removeTempRoot(tempRoot);
    tempRoot = null;
    folderPath = null;
    await fsp.rm(profilePath, { recursive: true, force: true });
    profilePath = null;
  });

  test('loads clips from an Electron-selected folder', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('load-basic'));

    await loadFolder(page, folderPath);

    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#count')).toHaveText('2 clips');
    await expect(page.locator('#activeCollectionName')).toHaveValue('__pipeline__');
    await expect(page).toHaveTitle('clips');
    await expect(page.locator('#globalAppBar #activityIndicatorBtn')).toBeVisible();
    await expect(page.locator('#screenCommandHost #pickBtn')).toBeVisible();
    await expect(page.locator('#appScreenSelector')).toBeVisible();
    await expect.poll(() => page.locator('#gridWrap').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && rect.bottom <= innerHeight + 1;
    })).toBe(true);
  });

  test('switching views reads clips and collection membership changed on disk', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('delete'));
    await fsp.writeFile(path.join(folderPath, 'subset.txt'), 'solo.mp4\n', 'utf8');
    await loadFolder(page, folderPath);
    await expect(page.locator('#grid .thumb')).toHaveCount(2);

    await fsp.copyFile(path.join(folderPath, 'solo.mp4'), path.join(folderPath, 'extra.mp4'));
    await fsp.writeFile(path.join(folderPath, 'subset.txt'), 'solo.mp4\nextra.mp4\n', 'utf8');
    await page.locator('#activeCollectionName').selectOption('subset.txt');

    // The previous view also shows two clips, so wait on the names, not the count.
    await expect.poll(() => allClipNames(page)).toEqual(['solo.mp4', 'extra.mp4']);
    await page.locator('#activeCollectionName').selectOption('__pipeline__');
    await expect.poll(() => allClipNames(page)).toEqual(['duo.webm', 'extra.mp4', 'solo.mp4']);
  });

  test('switches between saved collections in Electron', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('legacy-default'));

    await loadFolder(page, folderPath);

    await expect(page.locator('#activeCollectionName option')).toHaveText([
      'clips',
      'default-collection',
      'minus-1',
      'minus-2',
    ]);

    await page.locator('#activeCollectionName').selectOption('minus-1.txt');
    await expect.poll(async () => (await allClipNames(page)).join('|')).toBe('two.webm|one.mp4');
    await expect(page).toHaveTitle('minus-1');
  });

  test('saves a reordered pipeline view as a collection', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('default-source'));

    await loadFolder(page, folderPath);
    await expect.poll(async () => (await allClipNames(page)).join('|')).toBe('one.mp4|three.mp4|two.webm');

    await page.locator('#grid .thumb').nth(1).dragTo(page.locator('#grid .thumb').nth(0), {
      targetPosition: { x: 16, y: 16 },
    });

    await openOrderMenu(page);
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await page.locator('#saveAsNewBtn').click();
    await page.locator('#saveAsNewNameInput').fill('pipeline-order');
    await page.locator('#confirmSaveAsNewBtn').click();
    await openActivityPanel(page);
    await expect(page.locator('#activityIndicatorList li').first()).toHaveText('Saved pipeline-order.txt to the current pipeline folder.');

    const savedText = await fsp.readFile(path.join(folderPath, 'pipeline-order.txt'), 'utf8');
    expect(collectionFileLines(savedText)).toEqual(['three.mp4', 'one.mp4', 'two.webm']);
  });

  test('adds selected clips to another saved collection', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('order-valid'));

    await loadFolder(page, folderPath);
    await page.locator('#grid .thumb').nth(2).click();

    await openOrderMenu(page);
    await page.locator('#addToCollectionBtn').click();
    await expect(page.locator('#addToCollectionDialog')).toHaveAttribute('open', '');
    await page.locator('#addToCollectionSelect').selectOption('subset.txt');
    await page.locator('#confirmAddToCollectionBtn').click();

    await openActivityPanel(page);
    await expect(page.locator('#activityIndicatorList li').first()).toContainText('Added');
    const subsetText = await fsp.readFile(path.join(folderPath, 'subset.txt'), 'utf8');
    const lines = collectionFileLines(subsetText);
    expect(lines.includes('three.mp4')).toBe(true);
    expect(lines.includes('two.webm')).toBe(true);
  });

  // The Recycle Bin itself is not inspected; the file leaving the folder without an error is the observable outcome.
  test('moves a right-clicked clip to the Recycle Bin and rewrites affected saved collections', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('delete'));
    await fsp.writeFile(path.join(folderPath, 'subset.txt'), 'solo.mp4\n', 'utf8');

    await loadFolder(page, folderPath);
    await page.locator('#grid .thumb[data-name="solo.mp4"]').click({ button: 'right' });

    const trashItem = page.locator('#clipContextMenu [role="menuitem"]').last();
    await expect(trashItem).toHaveText('Move selected to Recycle Bin…');
    await trashItem.click();
    await expect(page.locator('#trashClipsDialog')).toHaveAttribute('open', '');
    await expect(page.locator('#trashClipsPreview')).toHaveText('solo.mp4');
    await page.locator('#confirmTrashClipsBtn').click();

    await openActivityPanel(page);
    await expect(page.locator('#activityIndicatorList li').first())
      .toContainText('Moved 1 clip to the Recycle Bin. Removed it from 1 saved collection.');
    await expect(page.locator('#grid .thumb')).toHaveCount(1);
    await expect(page.locator('#grid .thumb').first()).toHaveAttribute('data-name', 'duo.webm');
    await expect(fsp.access(path.join(folderPath, 'solo.mp4')).then(() => true).catch(() => false)).resolves.toBe(false);

    const subsetText = await fsp.readFile(path.join(folderPath, 'subset.txt'), 'utf8');
    expect(subsetText).toBe('');
  });

  test('opens zoom and toggles fullscreen inside Electron', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('load-basic'));

    await loadFolder(page, folderPath);

    await page.locator('#grid .thumb').first().dblclick();
    await expect(page.locator('#zoomOverlay')).toBeVisible();
    await expect(page.locator('#zoomVideo')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);

    await page.keyboard.press('F');
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await expect(page.locator('#globalAppBar')).toBeHidden();
    await expect(page.locator('#screenCommandHost')).toBeHidden();
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
    await expect(page.locator('#globalAppBar')).toBeVisible();
    await expect(page.locator('#screenCommandHost')).toBeVisible();
  });

  test('scales a clip smaller than its card up to fill the card on black', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('video-edit'));
    await resizeContent(electronApp, page, 1280, 800);

    await loadFolder(page, folderPath);

    await expect.poll(() => firstCardPictureFit(page)).toEqual(PICTURE_FILLS_CARD_ON_BLACK);
  });

  test('scales a clip smaller than its full-screen cell up to fill the cell on black', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('video-edit'));
    await resizeContent(electronApp, page, 1280, 800);
    await loadFolder(page, folderPath);
    await expect(page.locator('#grid .thumb')).toHaveCount(2);

    await page.keyboard.press('F');
    await expect(page.locator('body')).toHaveClass(/fs-active/);

    await expect.poll(() => firstCardPictureFit(page)).toEqual(PICTURE_FILLS_CARD_ON_BLACK);
  });

  test('runs Loopify end to end from zoom mode and keeps collection changes unsaved', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('video-edit'));

    await loadFolder(page, folderPath);
    await page.locator('#activeCollectionName').selectOption('focus.txt');
    await expect.poll(async () => (await allClipNames(page)).join('|')).toBe('source.mp4|alt.mp4');

    await page.locator('#grid .thumb').first().dblclick();
    await expect(page.locator('#zoomVideo')).toBeVisible();
    await page.locator('#zoomVideo').dispatchEvent('contextmenu', {
      bubbles: true,
      button: 2,
      clientX: 64,
      clientY: 72,
    });
    await expect(page.locator('#clipContextMenu [data-item-id="zoom-edit-loopify"]')).toBeVisible();
    await page.locator('#clipContextMenu [data-item-id="zoom-edit-loopify"]').click();

    await expect.poll(async () => (await allClipNames(page)).join('|'), { timeout: 20000 }).toBe('source.mp4|source-looped.mp4|alt.mp4');
    await expect(page.locator('#zoomVideo')).toHaveAttribute('data-name', 'source-looped.mp4');
    await expect(page.locator('#saveBtn')).toBeEnabled();
    await expect(page.locator('#activityIndicatorBtn')).toHaveAttribute('data-state', 'success');

    await page.keyboard.press('Escape');
    await expect(page.locator('#zoomOverlay')).toHaveCount(0);
    await openActivityPanel(page);
    await expect(page.locator('#activityIndicatorList li').first()).toHaveText('Created source-looped.mp4.');

    const savedCollectionText = await fsp.readFile(path.join(folderPath, 'focus.txt'), 'utf8');
    expect(collectionFileLines(savedCollectionText)).toEqual(['source.mp4', 'alt.mp4']);
    await expect(fsp.access(path.join(folderPath, 'source-looped.mp4')).then(() => true).catch(() => false)).resolves.toBe(true);
  });
});

