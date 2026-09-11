import { _electron as electron, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('artifacts', { recursive: true });
const artifactDir = process.env.PANEL_IMPL === 'local' ? 'artifacts/local' : 'artifacts';
await mkdir(artifactDir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('launch.cjs'), '--grid'], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#grid video')).toHaveCount(8);
  await expect.poll(() => page.locator('#grid video').evaluateAll(videos => videos.every(video => video.readyState >= 2))).toBe(true);
  await page.locator('#grid video').first().evaluate(async video => { video.muted = true; video.loop = true; await video.play(); });
  await page.waitForTimeout(300);
  const evidence = await page.evaluate(async () => {
    const grid = document.querySelector('#grid');
    const cards = [...grid.children];
    const videos = [...grid.querySelectorAll('video')];
    const playing = videos[0];
    const initialTime = playing.currentTime;
    const mediaEvents = [];
    for (const name of ['emptied', 'pause', 'loadstart']) playing.addEventListener(name, () => mediaEvents.push(name));
    const samples = [];
    const start = performance.now();
    document.querySelector('#fold').click();
    document.querySelector('#fold-right').click();
    while (performance.now() - start < 1000) {
      await new Promise(requestAnimationFrame);
      const bounds = id => document.querySelector(id).getBoundingClientRect();
      const left = bounds('#sidebar');
      const center = bounds('#workspace');
      const right = bounds('#sidebar-right');
      samples.push({ ms: performance.now() - start, left: left.width, center: center.width, right: right.width,
        gapLeft: center.left - left.right, gapRight: right.left - center.right,
        columns: grid.dataset.layoutCols, cardHeight: cards[0].getBoundingClientRect().height });
    }
    return { initialTime, finalTime: playing.currentTime, paused: playing.paused, mediaEvents,
      sameCards: cards.every((card, index) => grid.children[index] === card),
      sameVideos: videos.every((video, index) => grid.querySelectorAll('video')[index] === video), samples };
  });
  await writeFile(`${artifactDir}/grid-results.json`, JSON.stringify(evidence, null, 2) + '\n');
  expect(evidence.sameCards).toBe(true);
  expect(evidence.sameVideos).toBe(true);
  expect(evidence.paused).toBe(false);
  expect(evidence.mediaEvents).toEqual([]);
  expect(evidence.finalTime).not.toBe(evidence.initialTime);
  const final = evidence.samples.at(-1);
  expect(Math.abs(final.left - 36)).toBeLessThan(1);
  expect(Math.abs(final.right - 36)).toBeLessThan(1);
  expect(evidence.samples.every(sample => Math.abs(sample.gapLeft) <= 1 && Math.abs(sample.gapRight) <= 1)).toBe(true);
  const late = evidence.samples.filter(sample => sample.ms >= 500);
  const heightDrift = Math.max(...late.map(sample => sample.cardHeight)) - Math.min(...late.map(sample => sample.cardHeight));
  const rightOvershoot = Math.max(...evidence.samples.map(sample => sample.right)) - 240;
  console.log(JSON.stringify({ sameCards: evidence.sameCards, sameVideos: evidence.sameVideos, playbackContinues: !evidence.paused, lateHeightDrift: heightDrift, rightOvershoot, columns: [...new Set(evidence.samples.map(sample => sample.columns))] }, null, 2));
  expect(heightDrift).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${artifactDir}/real-grid.png` });
} finally { await app.close(); }
