import { _electron as electron, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifactDir = process.env.PANEL_IMPL === 'local' ? 'artifacts/local' : 'artifacts';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs')], env });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => document.documentElement.dataset.pilotReady === 'true');
  const result = await page.evaluate(async () => {
    let orientationChange = null;
    if (document.querySelector('wa-split-panel')) {
      const panel = document.createElement('wa-split-panel');
      panel.style.cssText = 'position:fixed;inset:0 auto auto 0;width:600px;height:300px;transition:none;--divider-width:0px';
      panel.primary = 'start';
      panel.positionInPixels = 150;
      const content = document.createElement('div');
      content.slot = 'start';
      panel.append(content);
      document.body.append(panel);
      await panel.updateComplete;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const before = content.getBoundingClientRect().width;
      panel.orientation = 'vertical';
      await panel.updateComplete;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const after = content.getBoundingClientRect().height;
      const separator = panel.shadowRoot.querySelector('[role="separator"]');
      const ariaOrientation = separator.getAttribute('aria-orientation');
      panel.remove();
      orientationChange = { expected: 150, before, after, ariaOrientation };
    }

    const rightWidths = [];
    const start = performance.now();
    document.querySelector('#fold').click();
    while (performance.now() - start < 800) {
      await new Promise(requestAnimationFrame);
      rightWidths.push(document.querySelector('#sidebar-right').getBoundingClientRect().width);
    }
    return { orientationChange,
      untouchedRightPanelDuringLeftFold: { expected: 240, min: Math.min(...rightWidths), max: Math.max(...rightWidths), final: rightWidths.at(-1) } };
  });
  await writeFile(`${artifactDir}/source-probes.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  expect(result.untouchedRightPanelDuringLeftFold.max - 240, 'The untouched panel must retain its width throughout the other panel motion').toBeLessThanOrEqual(1);
} finally { await app.close(); }
