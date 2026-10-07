import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const project = path.resolve('.');
const movie = process.argv.find(arg => arg.startsWith('--movie='))?.slice('--movie='.length);
if (!movie || !path.isAbsolute(movie)) throw new Error('Pass --movie=<absolute coded fixture path>.');
const root = await mkdtemp(path.join(os.tmpdir(), 'clip-preview-ui-'));
const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(root, 'profile')}`], cwd: project, env });
try {
  const page = await app.firstWindow();
  await page.evaluate(() => {
    const probe = { keys: [], paints: [] };
    window.__previewUiProbe = probe;
    document.addEventListener('keydown', event => {
      probe.keys.push({ key: event.key.toLowerCase(), ms: performance.now() });
    }, true);
    window.__clipSandboxFrameReviewPaintProbe = {
      painted(frame, pixels, ms) {
        let ordinal = frame.kind === 'exact-frame' ? frame.identity.frameIndex : 0;
        if (frame.kind === 'playback-frame') {
          for (let bit = 0; bit < 10; bit += 1) {
            const x = Math.floor((bit * 30 + 15) * frame.width / 320);
            const y = Math.floor(50 * frame.height / 180);
            if (pixels[(y * frame.width + x) * 4] > 125) ordinal |= 1 << bit;
          }
        }
        probe.paints.push({ kind: frame.kind, ordinal, ms });
      },
    };
  });
  await page.evaluate(sourcePath => window.clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
  await page.getByRole('button', { name: 'Open movie...' }).click();
  await page.locator('.frame-review-identity').waitFor();
  await page.waitForFunction(() => document.querySelector('.frame-review-readiness')
    ?.textContent?.includes('Exact review ready'), undefined, { timeout: 90_000 });
  const progress = page.locator('.frame-review-progress-row input');
  const setFrame = async ordinal => {
    await progress.evaluate((input, index) => {
      input.value = String(index);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, ordinal);
    await page.getByText(`Frame ${ordinal}`, { exact: true }).first().waitFor();
  };
  const samples = [];
  const measure = async (key, kind, label) => {
    const marker = await page.evaluate(() => performance.now());
    await page.keyboard.press(key);
    const expectedKey = key === 'Space' ? ' ' : key.toLowerCase();
    try {
      await page.waitForFunction(({ marker, kind }) => window.__previewUiProbe.paints
        .some(paint => paint.ms >= marker && paint.kind === kind), { marker, kind }, { timeout: 3_000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        player: document.querySelector('.frame-review-player [data-command="play-pause"]')?.getAttribute('data-playing'),
        identity: document.querySelector('.frame-review-identity')?.textContent,
        alert: document.querySelector('.frame-review-error')?.textContent,
        refine: document.querySelector('#refineGifScreen .gif-workflow-local-status')?.textContent,
        paints: window.__previewUiProbe.paints.slice(-5), keys: window.__previewUiProbe.keys.slice(-5),
      }));
      throw new Error(`${label} produced no ${kind} paint: ${JSON.stringify(state)}`, { cause: error });
    }
    const sample = await page.evaluate(({ marker, kind, expectedKey, label }) => {
      const probe = window.__previewUiProbe;
      const keyEvent = probe.keys.find(event => event.ms >= marker && event.key === expectedKey);
      const paint = probe.paints.find(event => event.ms >= marker && event.kind === kind);
      if (!keyEvent || !paint) throw new Error(`Missing ${label} event or paint.`);
      return { label, latencyMs: paint.ms - keyEvent.ms, firstPaintedOrdinal: paint.ordinal };
    }, { marker, kind, expectedKey, label });
    samples.push(sample);
  };

  await setFrame(24);
  await page.keyboard.press('q');
  await setFrame(96);
  await page.keyboard.press('w');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await measure('z', 'playback-frame', 'draft Z start');
    await measure('Space', 'exact-frame', 'draft Space pause');
    await measure('Space', 'playback-frame', 'draft Space resume');
    await measure('Space', 'exact-frame', 'draft Space pause');
  }
  for (const end of [94, 95, 96]) {
    await setFrame(end);
    await page.keyboard.press('w');
    await measure('z', 'playback-frame', 'revised Z start');
    await measure('Space', 'exact-frame', 'revised Space pause');
  }
  await page.keyboard.press('x');
  await page.locator('[data-range-id="range-1"] [data-refine-range]').click();
  await page.locator('#refineGifScreen').waitFor();
  await page.waitForFunction(() => !document.querySelector('#refineGifScreen [data-command="loop-range"]')?.disabled,
    undefined, { timeout: 10_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await measure('z', 'playback-frame', 'Refine Z start');
    await measure('Space', 'exact-frame', 'Refine Space pause');
    await measure('Space', 'playback-frame', 'Refine Space resume');
    await measure('Space', 'exact-frame', 'Refine Space pause');
  }
  const outputPath = path.join(root, 'latency.json');
  await writeFile(outputPath, JSON.stringify({ movie, samples }, null, 2) + '\n');
  const maximumMs = Math.max(...samples.map(sample => sample.latencyMs));
  process.stdout.write(JSON.stringify({ outputPath, sampleCount: samples.length, maximumMs,
    over500ms: samples.filter(sample => sample.latencyMs > 500) }) + '\n');
} finally {
  await app.close();
}
