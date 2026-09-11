import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifactDir = 'artifacts/popover';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env, PILOT_SURFACE: 'popover' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs')], env });
const results = [];
try {
  const page = await app.firstWindow();
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
        const trigger = page.locator('#keyboard-trigger');
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
          await expect(page.locator('#close-help')).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
          await page.waitForTimeout(interval);
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(700);
        const state = await page.locator('wa-popover').evaluate(el => ({
          open: el.open, dialogOpen: el.shadowRoot.querySelector('dialog').open,
          expanded: document.querySelector('#keyboard-trigger').getAttribute('aria-expanded'),
          focus: document.activeElement.id, input: window.inputEvidence,
        }));
        const visible = await page.locator('wa-popover [part="body"]').isVisible();
        const pass = state.open && state.dialogOpen && visible && state.expanded === 'true' && state.focus === 'close-help';
        results.push({ flow, interval, repeat, pass, visible, ...state });
        if (!pass && repeat === 1) await page.screenshot({ path: `${artifactDir}/${flow}-${interval}-failure.png` });
      }
    }
  }
  await writeFile(`${artifactDir}/input-results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.map(({ input, ...result }) => ({ ...result,
    trusted: input.every(event => event.trusted),
    inputGapsMs: input.slice(1).map((event, index) => Math.round(event.ms - input[index].ms)),
  })), null, 2));
  expect(results.filter(result => !result.pass), 'User-facing open sequences should settle visible with matching focus').toEqual([]);
} finally { await app.close(); }
