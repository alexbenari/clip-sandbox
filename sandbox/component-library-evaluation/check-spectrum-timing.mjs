import { _electron as electron, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const env = { ...process.env, PILOT_SURFACE: 'spectrum' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs'), `--user-data-dir=${resolve('artifacts/spectrum/timing-profile')}`], env });
const results = [];
try {
  const page = await app.firstWindow();
  for (const interval of [100, 200, 350]) {
    for (let repeat = 1; repeat <= 2; repeat++) {
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.pilotReady === 'true');
      await page.locator('#keyboard-trigger').click();
      await expect(page.locator('#close-help')).toBeFocused();
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.timingEvidence = [];
        for (const type of ['keydown', 'focusin']) document.addEventListener(type, event => {
          window.timingEvidence.push({ type, key: event.key ?? null, target: event.target.id, trusted: event.isTrusted, ms: performance.now() });
        }, true);
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(interval);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);
      const state = await page.locator('sp-overlay').evaluate(el => ({ open: el.open, focus: document.activeElement.id, expanded: document.querySelector('#keyboard-trigger').getAttribute('aria-expanded'), input: window.timingEvidence }));
      const visible = await page.locator('sp-popover').isVisible();
      results.push({ interval, repeat, visible, ...state });
    }
  }
  await writeFile('artifacts/spectrum/timing-results.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await app.close(); }
