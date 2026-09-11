import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('artifacts', { recursive: true });
const artifactDir = process.env.PANEL_IMPL === 'local' ? 'artifacts/local' : 'artifacts';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs')], env });
const results = {};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.pilotReady === 'true');
  const sidebar = page.locator('#sidebar');
  const workspace = page.locator('#workspace');
  const fold = page.getByRole('button', { name: 'Fold Pipelines' });
  const reveal = page.getByRole('button', { name: 'Reveal Pipelines' });
  const width = locator => locator.evaluate(element => element.getBoundingClientRect().width);
  const expectWidth = (locator, expected) => expect.poll(async () => Math.abs(await width(locator) - expected)).toBeLessThanOrEqual(1);
  const expectAdjacent = async () => {
    const gap = await page.evaluate(() => document.querySelector('#workspace').getBoundingClientRect().left - document.querySelector('#sidebar').getBoundingClientRect().right);
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  };

  await expectWidth(sidebar, 240);
  await expectAdjacent();
  const openWidth = await width(workspace);
  await page.screenshot({ path: `${artifactDir}/open.png` });
  await fold.click();
  await expectWidth(sidebar, 36);
  await expectWidth(workspace, openWidth + 204);
  await expectAdjacent();
  await expect(reveal).toBeFocused();
  await page.screenshot({ path: `${artifactDir}/folded.png` });
  await reveal.click();
  await expectWidth(sidebar, 240);
  await expectWidth(workspace, openWidth);
  await expectAdjacent();
  results.F1 = 'pass: 240 -> 36 -> 240, workspace gains 204px';

  const reversal = await page.evaluate(async () => {
    const panel = document.querySelector('#sidebar');
    const read = () => panel.getBoundingClientRect().width;
    document.querySelector('#fold').click();
    const deadline = performance.now() + 1000;
    while (read() > 150 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    const before = read();
    document.querySelector('#reveal').click();
    const immediate = read();
    await new Promise(requestAnimationFrame);
    return { before, immediate, next: read() };
  });
  expect(reversal.before).toBeGreaterThan(36);
  expect(reversal.before).toBeLessThan(220);
  expect(Math.abs(reversal.immediate - reversal.before)).toBeLessThan(1);
  expect(Math.abs(reversal.next - reversal.before)).toBeLessThan(80);
  await expectWidth(sidebar, 240);
  await page.waitForTimeout(400);
  await expectWidth(sidebar, 240);
  results.F2 = { automatic: 'pass: intermediate width, reversal continuity and final state', reversal, visual: 'unverified: requires continuous-motion review' };

  await fold.focus();
  await page.keyboard.press('Enter');
  await expect(reveal).toBeFocused();
  await expect(reveal).toHaveAttribute('aria-expanded', 'false');
  await expect(reveal).toHaveAttribute('aria-controls', 'panel-content');
  await page.keyboard.press('Tab');
  await expect(page.locator('#workspace-action')).toBeFocused();
  await reveal.focus();
  await page.keyboard.press('Space');
  await expect(fold).toBeFocused();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expectWidth(sidebar, 240);
  await page.locator('#workspace-action').focus();
  await fold.evaluate(button => button.click());
  await expect(page.locator('#workspace-action')).toBeFocused();
  await expectWidth(sidebar, 36);
  await reveal.click();
  await expectWidth(sidebar, 240);
  await page.locator('.sample').first().focus();
  await fold.evaluate(button => button.click());
  await expect(reveal).toBeFocused();
  await expectWidth(sidebar, 36);
  results.F3 = 'pass: Enter/Space, ARIA, hidden content skipped, inside/outside focus';

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reveal.click();
  await expectWidth(sidebar, 240);
  const durations = await page.locator('#split, #panel-content').evaluateAll(elements => elements.map(element => getComputedStyle(element).transitionDuration));
  expect(durations).toEqual(['0s', '0s']);
  await fold.click();
  await expectWidth(sidebar, 36);
  await expect(reveal).toBeFocused();
  results.F4 = 'pass: zero transition duration, same bounds and focus';

  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, nodeAccess: typeof window.require }));
  expect(viewport.width).toBe(1440);
  expect(viewport.height).toBe(900);
  expect(viewport.nodeAccess).toBe('undefined');
  expect(errors).toEqual([]);
  results.F5 = { runtime: 'pass: networking blocked, no renderer/load errors', viewport, electron: await app.evaluate(({ app }) => app.getVersion()) };
  await reveal.click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const right = page.locator('#sidebar-right');
  const foldRight = page.getByRole('button', { name: 'Fold Clips' });
  const revealRight = page.getByRole('button', { name: 'Reveal Clips' });
  await expectWidth(right, 240);
  await foldRight.focus();
  await page.keyboard.press('Enter');
  await expectWidth(right, 36);
  await expectWidth(sidebar, 240);
  await expect(revealRight).toBeFocused();
  await expect(revealRight).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expectWidth(right, 240);
  await expect(foldRight).toBeFocused();
  await fold.click();
  await expectWidth(sidebar, 36);
  await expectWidth(right, 240);
  expect(await page.locator('#panel-content-right').evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await reveal.click();
  await expectWidth(sidebar, 240);
  for (let index = 0; index < 6; index++) {
    await page.locator(index % 2 === 0 ? '#fold, #fold-right' : '#reveal, #reveal-right').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await page.waitForTimeout(45);
  }
  await expectWidth(sidebar, 240);
  await expectWidth(right, 240);
  await page.waitForTimeout(400);
  await expectWidth(sidebar, 240);
  await expectWidth(right, 240);
  results.F6 = 'pass: right keyboard/focus, independent state, simultaneous rapid reversals, latest state settles';

  for (const viewportWidth of [800, 1100, 1440]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900), viewportWidth);
    await expectWidth(sidebar, 240);
    await expectWidth(right, 240);
    await expectWidth(workspace, viewportWidth - 480);
    await expectAdjacent();
    expect(await page.evaluate(() => Math.abs(document.querySelector('#sidebar-right').getBoundingClientRect().left - document.querySelector('#workspace').getBoundingClientRect().right))).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: `${artifactDir}/two-panels.png` });
  results.F7 = 'pass: 800/1100/1440px settled resize bounds and adjacency';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await foldRight.click();
  await expectWidth(right, 36);
  expect(await page.locator('#split-right, #panel-content-right').evaluateAll(elements => elements.map(el => getComputedStyle(el).transitionDuration))).toEqual(['0s', '0s']);
  await expect(revealRight).toBeFocused();
  results.F8 = 'pass: opposite-side reduced motion';
  expect(errors).toEqual([]);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${artifactDir}/results.json`, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  await app.close();
}
