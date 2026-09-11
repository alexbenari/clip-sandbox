import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = 'artifacts/shell';
await mkdir(dir, { recursive: true });
const env = { ...process.env, PILOT_SURFACE: 'shell' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs'), `--user-data-dir=${resolve(dir, 'test-profile')}`, ...(process.argv.includes('--title-overlay') ? ['--title-overlay'] : [])], env });
const results = {};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.shellReady === 'true');
  await expect(page.locator('#grid video')).toHaveCount(8);
  await expect.poll(() => page.locator('#grid video').evaluateAll(videos => videos.every(video => video.readyState >= 2))).toBe(true);
  await page.screenshot({ path: `${dir}/expanded-1440.png` });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 900));
  await page.locator('#grid video').first().evaluate(async video => { video.muted = true; video.loop = true; await video.play(); });
  await page.waitForTimeout(300);
  results.motion = await page.evaluate(async () => {
    const grid = document.querySelector('#grid');
    const cards = [...grid.children];
    const videos = [...grid.querySelectorAll('video')];
    const mediaEvents = [];
    for (const name of ['pause', 'emptied', 'loadstart']) videos[0].addEventListener(name, () => mediaEvents.push(name));
    const initialTime = videos[0].currentTime;
    const initialColumns = grid.dataset.layoutCols;
    const samples = [];
    const start = performance.now();
    document.querySelector('#fold').click();
    document.querySelector('#fold-right').click();
    while (performance.now() - start < 700) {
      await new Promise(requestAnimationFrame);
      const left = document.querySelector('#sidebar').getBoundingClientRect();
      const center = document.querySelector('#workspace').getBoundingClientRect();
      const right = document.querySelector('#sidebar-right').getBoundingClientRect();
      samples.push({ ms: performance.now() - start, left: left.width, center: center.width, right: right.width, gapLeft: center.left - left.right, gapRight: right.left - center.right, cards: cards.map(card => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
    }
    return { initialColumns, finalColumns: grid.dataset.layoutCols, sameCards: cards.every((card, i) => grid.children[i] === card), sameVideos: videos.every((video, i) => grid.querySelectorAll('video')[i] === video), paused: videos[0].paused, initialTime, finalTime: videos[0].currentTime, mediaEvents, samples };
  });
  const motion = results.motion;
  expect(motion.initialColumns, 'This fixture must exercise a real column-count change').not.toBe(motion.finalColumns);
  expect(motion.sameCards && motion.sameVideos).toBe(true);
  expect(motion.paused).toBe(false);
  expect(motion.finalTime).not.toBe(motion.initialTime);
  expect(motion.mediaEvents).toEqual([]);
  expect(motion.samples.every(s => Math.abs(s.gapLeft) <= 1 && Math.abs(s.gapRight) <= 1)).toBe(true);
  const late = motion.samples.filter(s => s.ms >= 260);
  for (let i = 0; i < 8; i++) for (const dimension of ['x', 'y', 'width', 'height']) {
    expect(Math.max(...late.map(s => s.cards[i][dimension])) - Math.min(...late.map(s => s.cards[i][dimension]))).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: `${dir}/folded.png` });
  await page.locator('#reveal').click();
  await page.waitForTimeout(100);
  await page.locator('#fold').evaluate(el => el.click());
  await page.waitForTimeout(400);
  expect(await page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width)).toBe(36);
  results.reversal = 'pass: interrupted reveal settles folded';
  await page.locator('#settings-screen').click();
  await expect(page.locator('.command-bar')).not.toBeVisible();
  await expect(page.locator('#collection-view')).not.toBeVisible();
  await expect(page.locator('#folder-setting')).toBeFocused();
  await page.evaluate(() => {
    document.querySelector('#collection-screen').click();
    document.querySelector('#settings-screen').click();
    document.querySelector('#collection-screen').click();
  });
  await expect(page.locator('.command-bar')).toBeVisible();
  await expect(page.locator('#settings-view')).not.toBeVisible();
  await expect(page.locator('#workspace-action')).toBeFocused();
  results.screens = 'pass: command ownership, inactive visibility, final request and focus';
  await page.locator('#keyboard-trigger').click();
  await expect(page.locator('#keyboard-content')).toBeVisible();
  await expect(page.locator('#close-help')).toBeFocused();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.utilityFrames = [];
    window.utilitySampling = true;
    const sample = () => {
      const utility = document.querySelector('#utility');
      const body = utility.shadowRoot.querySelector('[part="body"]');
      window.utilityFrames.push({ visible: body.checkVisibility(), keyboard: !document.querySelector('#keyboard-content').hidden, activity: !document.querySelector('#activity-content').hidden });
      if (window.utilitySampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('#activity-trigger').click();
  await expect(page.locator('#activity-content')).toBeVisible();
  await expect(page.locator('#keyboard-content')).not.toBeVisible();
  await expect(page.locator('#activity-trigger')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#keyboard-trigger')).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(300);
  results.utilityFrames = await page.evaluate(() => { window.utilitySampling = false; return window.utilityFrames; });
  expect(results.utilityFrames.length).toBeGreaterThan(0);
  expect(results.utilityFrames.every(frame => frame.visible && frame.keyboard !== frame.activity)).toBe(true);
  await expect(page.locator('#activity-content button')).toBeFocused();
  await page.locator('#activity-content summary').click();
  await expect(page.locator('#activity-content code')).toBeVisible();
  await page.screenshot({ path: `${dir}/activity.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#utility')).toHaveJSProperty('open', false);
  await expect(page.locator('#activity-trigger')).toBeFocused();
  await page.evaluate(() => {
    document.querySelector('#keyboard-trigger').click();
    document.querySelector('#activity-trigger').click();
    document.querySelector('#keyboard-trigger').click();
  });
  await expect(page.locator('#keyboard-content')).toBeVisible();
  await expect(page.locator('#activity-content')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#keyboard-trigger')).toBeFocused();
  await page.locator('#keyboard-trigger').click();
  await expect(page.locator('#close-help')).toBeFocused();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await expect(page.locator('#keyboard-content')).toBeVisible();
  await expect(page.locator('#close-help')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#utility')).toHaveJSProperty('open', false);
  await expect(page.locator('#keyboard-trigger')).toBeFocused();
  results.utilities = 'pass: single surface switching, expanded state, details, Escape return focus, rapid last request';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#reveal').click();
  await expect.poll(() => page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width)).toBe(240);
  expect(await page.locator('#split').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.locator('#settings-screen').click();
  expect(await page.locator('#workspace').evaluate(el => el.getAnimations().length)).toBe(0);
  results.reducedMotion = 'pass: immediate panel state and no screen animation';
  await page.locator('#collection-screen').click();
  for (const width of [800, 1800]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 900), width);
    await page.waitForTimeout(200);
    expect(await page.locator('#workspace').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0);
    await page.screenshot({ path: `${dir}/width-${width}.png` });
  }
  results.windowControls = await page.evaluate(() => ({ overlayVisible: navigator.windowControlsOverlay?.visible ?? false, rect: navigator.windowControlsOverlay?.getTitlebarAreaRect().toJSON(), activity: document.querySelector('#activity-trigger').getBoundingClientRect().toJSON() }));
  if (process.argv.includes('--title-overlay')) {
    expect(results.windowControls.overlayVisible).toBe(true);
    expect(results.windowControls.activity.right).toBeLessThanOrEqual(results.windowControls.rect.right);
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  results.nativeWindowApi = 'pass: maximize/unmaximize callable; physical controls/drag require manual review';
  expect(errors).toEqual([]);
  results.errors = errors;
  console.log(JSON.stringify({ columns: [motion.initialColumns, motion.finalColumns], reversal: results.reversal, screens: results.screens, utilities: results.utilities, reducedMotion: results.reducedMotion, windowControls: results.windowControls }, null, 2));
} finally {
  await writeFile(`${dir}/${process.argv.includes('--title-overlay') ? 'overlay-' : ''}results.json`, JSON.stringify(results, null, 2) + '\n');
  await app.close();
}
