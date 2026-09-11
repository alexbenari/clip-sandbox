import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('natural fullscreen rotation preserves source identity through exit and Zoom', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-identity-'));
  const clips = path.join(directory, 'clips');
  await fs.mkdir(clips);
  const examples = [
    { name: 'amber.mp4', color: 'orange', size: '320x180', duration: 1 },
    { name: 'blue.mp4', color: 'blue', size: '180x320', duration: 2 },
    { name: 'green.mp4', color: 'green', size: '240x240', duration: 3 },
    { name: 'red.mp4', color: 'red', size: '480x270', duration: 4 },
  ];
  for (const sample of examples) {
    execFileSync(path.resolve('node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
      ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${sample.color}:s=${sample.size}:r=24`,
        '-t', String(sample.duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(clips, sample.name)], { windowsHide: true });
  }
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    await page.locator('#pickBtn').waitFor();
    await page.evaluate(async folder => {
      await (window as unknown as Window & { clipSandboxDesktop: { __testSetNextFolderPath(path: string): Promise<void> } }).clipSandboxDesktop.__testSetNextFolderPath(folder);
    }, clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(4);
    await expect.poll(() => page.locator('#grid video').evaluateAll(nodes => nodes.every(node => (node as HTMLVideoElement).readyState >= 2))).toBe(true);
    const readCards = () => page.locator('#grid .thumb').evaluateAll(nodes => nodes.map(node => {
      const card = node as HTMLElement;
      const video = card.querySelector('video')!;
      return { id: card.dataset.clipId, name: card.dataset.name, source: video.currentSrc,
        duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    }));
    const before = await readCards();
    for (const sample of examples) expect(before.find(card => card.name === sample.name)?.duration).toBeCloseTo(sample.duration, 1);
    await page.locator('#fsBtn').click();
    await expect(page.locator('body')).toHaveClass(/fs-active/);
    await page.keyboard.press('3');
    await expect(page.locator('#grid .thumb:visible')).toHaveCount(2);
    const visibleNames = () => page.locator('#grid .thumb:visible').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.name));
    const initial = await visibleNames();
    await expect.poll(visibleNames, { timeout: 12000 }).not.toEqual(initial);
    expect(await readCards()).toEqual(before);
    const rotatedName = (await visibleNames()).find(name => !initial.includes(name))!;
    await page.screenshot({ path: 'test-results/encapsulation-fullscreen.png' });
    await page.keyboard.press('f');
    await expect(page.locator('#grid .thumb:visible')).toHaveCount(4);
    expect(await readCards()).toEqual(before);
    const card = page.locator(`#grid .thumb[data-name="${rotatedName}"]`);
    await card.click();
    await expect(card).toHaveClass(/selected/);
    await card.dblclick();
    await expect(page.locator('#zoomVideo')).toHaveAttribute('data-name', rotatedName);
    await expect.poll(() => page.locator('#zoomVideo').evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    const zoom = await page.locator('#zoomVideo').evaluate(node => {
      const video = node as HTMLVideoElement;
      return { source: video.currentSrc, duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    });
    const expected = before.find(item => item.name === rotatedName)!;
    expect(zoom).toEqual({ source: expected.source, duration: expected.duration, width: expected.width, height: expected.height });
    await page.screenshot({ path: 'test-results/encapsulation-zoom.png' });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
