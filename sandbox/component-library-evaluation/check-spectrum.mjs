import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifactDir = 'artifacts/spectrum';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env, PILOT_SURFACE: 'spectrum' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs'), `--user-data-dir=${resolve(artifactDir, 'test-profile')}`], env });
const results = {};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.pilotReady === 'true');
  const trigger = page.locator('#keyboard-trigger');
  const close = page.locator('#close-help');
  const surface = page.locator('sp-overlay');
  const body = page.locator('sp-popover');
  const expectOpen = async value => {
    await expect.poll(() => surface.evaluate(el => el.open)).toBe(value);
    if (value) {
      await expect(body).toBeVisible();
      await expect.poll(() => body.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    } else await expect(body).not.toBeVisible();
  };
  const workspaceBounds = await page.locator('#workspace').boundingBox();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expectOpen(true);
  await expect(close).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })).toBeVisible();
  await expect(body.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  expect(await body.locator('kbd').evaluateAll(keys => keys.every(key => key.tabIndex < 0))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Global', exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs((await body.boundingBox()).y - ((await trigger.boundingBox()).y + (await trigger.boundingBox()).height + 10))).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expectOpen(true);
  await close.click();
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  results.U1 = 'pass: Enter/Space, Close focus, Escape/Close return focus, ARIA, named dialog, read-only content';
  await trigger.click();
  await expectOpen(true);
  await page.mouse.click(50, 200);
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('#workspace').boundingBox()).toEqual(workspaceBounds);
  results.U2 = 'pass: outside dismissal, focus return, workspace unchanged';
  for (const width of [1440, 420]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 700), width);
    await trigger.click();
    await expectOpen(true);
    await expect.poll(async () => {
      const rect = await body.boundingBox();
      return !!rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 701;
    }).toBe(true);
    await page.screenshot({ path: `${artifactDir}/width-${width}.png` });
    await close.click();
    await expectOpen(false);
  }
  await trigger.evaluate(el => { el.style.position = 'fixed'; el.style.bottom = '8px'; el.style.right = '8px'; });
  await trigger.click();
  await expectOpen(true);
  await expect.poll(async () => (await body.boundingBox()).y + (await body.boundingBox()).height <= (await trigger.boundingBox()).y + 1).toBe(true);
  await page.screenshot({ path: `${artifactDir}/bottom-edge.png` });
  await close.click();
  await expectOpen(false);
  results.U3 = 'pass: 10px anchor gap, 1440/420px containment, bottom-edge flip';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expectOpen(true);
  const durations = await body.evaluate(el => getComputedStyle(el).transitionDuration.split(',').map(value => parseFloat(value)));
  expect(durations.every(value => value === 0)).toBe(true);
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  results.U4 = { pass: true, transitionDurations: durations };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  results.input = [];
  for (const flow of ['triple-trigger-click', 'escape-then-enter']) {
    for (const interval of [100, 200, 350]) {
      for (let repeat = 1; repeat <= 2; repeat++) {
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.pilotReady === 'true');
        await page.evaluate(() => {
          window.inputEvidence = [];
          for (const type of ['click', 'keydown']) document.addEventListener(type, event => {
            window.inputEvidence.push({ type, key: event.key ?? null, target: event.target.id, trusted: event.isTrusted, ms: performance.now() });
          }, true);
        });
        const bounds = await trigger.boundingBox();
        const click = () => page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await click();
        if (flow === 'triple-trigger-click') {
          await page.waitForTimeout(interval);
          await click();
          await page.waitForTimeout(interval);
          await click();
        } else {
          await page.waitForTimeout(300);
          await expect(close).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
          await page.waitForTimeout(interval);
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(700);
        const state = await surface.evaluate(el => ({ open: el.open, expanded: document.querySelector('#keyboard-trigger').getAttribute('aria-expanded'), focus: document.activeElement.id, input: window.inputEvidence }));
        const visible = await body.isVisible();
        const pass = state.open && visible && state.expanded === 'true' && state.focus === 'close-help';
        results.input.push({ flow, interval, repeat, pass, visible, ...state });
        if (!pass && repeat === 1) await page.screenshot({ path: `${artifactDir}/${flow}-${interval}-failure.png` });
      }
    }
  }
  expect(errors).toEqual([]);
  results.U5 = 'pass: offline runtime, no renderer/load errors';
  expect(results.input.filter(result => !result.pass), 'Real-control sequences should reopen visible with matching focus').toEqual([]);
  console.log(JSON.stringify({ ...results, input: results.input.map(({ input, ...state }) => ({ ...state, trusted: input.every(event => event.trusted) })) }, null, 2));
} finally {
  await writeFile(`${artifactDir}/results.json`, JSON.stringify(results, null, 2) + '\n');
  await app.close();
}
