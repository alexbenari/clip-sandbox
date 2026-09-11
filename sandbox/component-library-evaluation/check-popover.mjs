import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifactDir = 'artifacts/popover';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env, PILOT_SURFACE: 'popover' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs')], env });
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
  const surface = page.locator('wa-popover');
  const body = surface.locator('[part="body"]');
  const dialog = surface.locator('dialog');
  const expectOpen = async value => {
    await expect.poll(() => surface.evaluate(el => el.open)).toBe(value);
    if (value) {
      await expect(body).toBeVisible();
      await expect.poll(() => surface.locator('wa-popup').locator('[part="popup"]').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    }
    else await expect(dialog).not.toHaveAttribute('open', '');
  };
  const workspaceBounds = await page.locator('#workspace').boundingBox();

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expectOpen(true);
  await expect(close).toBeFocused();
  await expect.poll(async () => Math.abs((await body.boundingBox()).y - ((await trigger.boundingBox()).y + (await trigger.boundingBox()).height + 10))).toBeLessThanOrEqual(1);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(surface.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  expect(await surface.locator('kbd').evaluateAll(keys => keys.every(key => key.tabIndex < 0))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Global', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expectOpen(true);
  await close.click();
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  results.U1 = 'pass: Enter/Space open, autofocus, Escape/Close restore focus, read-only keys and trigger ARIA';

  await trigger.click();
  await expectOpen(true);
  await page.mouse.click(50, 200);
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('#workspace').boundingBox()).toEqual(workspaceBounds);
  results.U2 = 'pass: outside click dismisses, invoking focus restored, workspace unchanged';

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
  results.U3 = 'pass: 1440/420px viewport containment and bottom-edge flip';

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expectOpen(true);
  expect(await surface.evaluate(el => [getComputedStyle(el).getPropertyValue('--show-duration').trim(), getComputedStyle(el).getPropertyValue('--hide-duration').trim()])).toEqual(['0ms', '0ms']);
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  results.U4 = 'pass: reduced motion durations and focus';
  expect(errors).toEqual([]);
  results.U5 = 'pass: offline runtime, no renderer/load errors';
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await surface.evaluate(async el => {
    el.open = true;
    await new Promise(resolve => setTimeout(resolve, 45));
    el.open = false;
    await new Promise(resolve => setTimeout(resolve, 45));
    el.open = true;
  });
  await page.waitForTimeout(500);
  const interrupted = await surface.evaluate(el => ({ open: el.open, dialogOpen: el.shadowRoot.querySelector('dialog').open }));
  const bare = await page.evaluate(async () => {
    const anchor = document.createElement('button');
    anchor.id = 'bare-trigger';
    anchor.textContent = 'Bare popover probe';
    document.body.append(anchor);
    const popover = document.createElement('wa-popover');
    popover.for = anchor.id;
    popover.textContent = 'No application handlers';
    document.body.append(popover);
    await popover.updateComplete;
    popover.open = true;
    await new Promise(resolve => setTimeout(resolve, 45));
    popover.open = false;
    await new Promise(resolve => setTimeout(resolve, 45));
    popover.open = true;
    await new Promise(resolve => setTimeout(resolve, 500));
    const observed = { open: popover.open, dialogOpen: popover.shadowRoot.querySelector('dialog').open };
    popover.open = false;
    await new Promise(resolve => setTimeout(resolve, 250));
    popover.remove();
    anchor.remove();
    return observed;
  });
  results.U6 = { interrupted, bare };
  expect(interrupted).toEqual({ open: true, dialogOpen: true });
  expect(bare).toEqual({ open: true, dialogOpen: true });
  await surface.evaluate(el => { el.open = true; });
  await expectOpen(true);
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expectOpen(false);
  await expect(trigger).toBeFocused();
  results.U6 = 'pass: interrupted open/close/open settles on requested visible state and focus';
  expect(errors).toEqual([]);
  results.U5 = 'pass: offline runtime, no renderer/load errors';
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${artifactDir}/results.json`, JSON.stringify(results, null, 2) + '\n');
  await app.close();
}
