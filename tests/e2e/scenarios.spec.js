import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

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

async function launchApp() {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLIP_SANDBOX_E2E: '1',
    },
  });
  const page = await electronApp.firstWindow();
  await page.waitForSelector('#pickBtn');
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
  await page.click('#pickBtn');
}

async function allClipNames(page) {
  return page.locator('#grid .thumb').evaluateAll((els) => els.map((el) => el.dataset.name));
}

async function openOrderMenu(page) {
  await page.click('#orderMenuBtn');
  await expect(page.locator('#orderMenu')).toHaveAttribute('data-open', 'true');
}

async function openGridContextMenu(page, locator = page.locator('#gridWrap')) {
  await locator.dispatchEvent('contextmenu', {
    bubbles: true,
    button: 2,
    clientX: 48,
    clientY: 48,
  });
  await expect.poll(async () => page.locator('#clipContextMenu [role="menuitem"]').count()).toBeGreaterThan(0);
}

test.describe('Electron runtime migration', () => {
  let electronApp;
  let page;
  let tempRoot;
  let folderPath;

  test.beforeEach(async () => {
    ({ electronApp, page } = await launchApp());
  });

  test.afterEach(async () => {
    await closeApp(electronApp);
    electronApp = null;
    page = null;
    await removeTempRoot(tempRoot);
    tempRoot = null;
    folderPath = null;
  });

  test('loads clips from an Electron-selected folder', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('load-basic'));

    await loadFolder(page, folderPath);

    await expect(page.locator('#grid .thumb')).toHaveCount(2);
    await expect(page.locator('#count')).toHaveText('2 clips');
    await expect(page.locator('#activeCollectionName')).toHaveValue('__pipeline__');
    await expect(page).toHaveTitle('clips');
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

    await page.selectOption('#activeCollectionName', 'minus-1.txt');
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
    await page.click('#saveAsNewBtn');
    await page.fill('#saveAsNewNameInput', 'pipeline-order');
    await page.click('#confirmSaveAsNewBtn');
    await expect(page.locator('#status')).toHaveText('Saved pipeline-order.txt to the current pipeline folder.');

    const savedText = await fsp.readFile(path.join(folderPath, 'pipeline-order.txt'), 'utf8');
    expect(savedText.trim().split('\n')).toEqual(['three.mp4', 'one.mp4', 'two.webm']);
  });

  test('adds selected clips to another saved collection', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('order-valid'));

    await loadFolder(page, folderPath);
    await page.locator('#grid .thumb').nth(2).click();

    await openOrderMenu(page);
    await page.click('#addToCollectionBtn');
    await expect(page.locator('#addToCollectionDialog')).toHaveAttribute('open', '');
    await page.selectOption('#addToCollectionSelect', 'subset.txt');
    await page.click('#confirmAddToCollectionBtn');

    await expect(page.locator('#status')).toContainText('Added');
    const subsetText = await fsp.readFile(path.join(folderPath, 'subset.txt'), 'utf8');
    const lines = subsetText.trim().split('\n');
    expect(lines.includes('three.mp4')).toBe(true);
    expect(lines.includes('two.webm')).toBe(true);
  });

  test('deletes clips from disk and rewrites affected saved collections', async () => {
    ({ tempRoot, folderPath } = await createScenarioFolder('delete'));
    await fsp.writeFile(path.join(folderPath, 'subset.txt'), 'solo.mp4\n', 'utf8');

    await loadFolder(page, folderPath);
    await page.locator('#grid .thumb').nth(1).click();

    await openGridContextMenu(page);
    await expect(page.locator('#clipContextMenu [role="menuitem"]')).toHaveText([
      'Add to subset',
      'New collection...',
      'Delete from Disk...',
    ]);

    await page.click('#clipContextMenu [data-item-id="delete-from-disk"]');
    await expect(page.locator('#deleteFromDiskDialog')).toHaveAttribute('open', '');
    await page.click('#confirmDeleteFromDiskBtn');

    await expect(page.locator('#status')).toContainText('Deleted 1 clip from disk.');
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
    await page.keyboard.press('F');
    await expect(page.locator('body')).not.toHaveClass(/fs-active/);
  });
});
