import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('panels reclaim width continuously, reverse, and preserve the working grid', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-panels-'));
  const clips = path.join(directory, 'clips');
  await fs.mkdir(clips);
  for (let index = 1; index <= 8; index++) await fs.copyFile('tests/e2e/fixtures/video-edit/clips/source.mp4', path.join(clips, `sample-${index}.mp4`));
  const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
  try {
    const page = await app.firstWindow();
    // Use content dimensions so native frame height cannot move this fixture away from a column boundary.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 900));
    await page.evaluate(async folder => { await (window as any).clipSandboxDesktop.__testSetNextFolderPath(folder); }, clips);
    await page.locator('#pickBtn').click();
    await expect(page.locator('#grid .thumb')).toHaveCount(8);
    await expect.poll(() => page.locator('#grid video').evaluateAll(nodes => nodes.every(node => (node as HTMLVideoElement).readyState >= 2))).toBe(true);
    await page.locator('#grid .thumb').first().click();
    await page.evaluate(() => { (window as any).panelVideos = [...document.querySelectorAll('#grid video')]; });
    const expandedWidth = (await page.locator('#centralWorkspace').boundingBox())!.width;
    const expandedColumns = await page.locator('#grid').getAttribute('data-layout-cols');
    await page.screenshot({ path: 'test-results/panels-open.png' });
    const frames = await page.evaluate(async () => {
      const sizes: number[] = [];
      document.querySelector<HTMLButtonElement>('#foldPipelines')!.click();
      const started = performance.now();
      while (performance.now() - started < 500) {
        await new Promise(requestAnimationFrame);
        sizes.push(document.querySelector('#centralWorkspace')!.getBoundingClientRect().width);
      }
      return sizes;
    });
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    expect(frames.some(width => width > expandedWidth + 10 && width < expandedWidth + 190)).toBe(true);
    expect(frames.at(-1)! - expandedWidth).toBeCloseTo(204, 0);
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    await page.locator('#foldClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    expect((await page.locator('#centralWorkspace').boundingBox())!.width - expandedWidth).toBeCloseTo(408, 0);
    expect(await page.locator('#grid').getAttribute('data-layout-cols')).not.toBe(expandedColumns);
    await page.screenshot({ path: 'test-results/panels-folded.png' });
    await expect(page.locator('#activeCollectionName')).toBeInViewport();
    await page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('#revealPipelines')!.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      document.querySelector<HTMLButtonElement>('#foldPipelines')!.click();
    });
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('#revealPipelines')).toHaveAttribute('aria-expanded', 'false');
    const motion = await page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('#revealPipelines')!.click();
      document.querySelector<HTMLButtonElement>('#revealClips')!.click();
      const started = performance.now();
      let reversed = false;
      const frames: { time: number; centerWidth: number; cardTop: number; cardWidth: number; moving: string | undefined }[] = [];
      while (performance.now() - started < 600) {
        await new Promise(requestAnimationFrame);
        if (!reversed && performance.now() - started >= 100) {
          document.querySelector<HTMLButtonElement>('#foldPipelines')!.click();
          reversed = true;
        }
        const card = document.querySelectorAll('#grid .thumb')[3].getBoundingClientRect();
        frames.push({ time: performance.now() - started, centerWidth: document.querySelector('#centralWorkspace')!.getBoundingClientRect().width, cardTop: card.top, cardWidth: card.width, moving: (document.querySelector('#workspaceRow') as HTMLElement).dataset.moving });
      }
      return frames;
    });
    await fs.writeFile('test-results/panel-motion-samples.json', JSON.stringify(motion, null, 2));
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('#pipelinesPanel')).toHaveClass(/folded/);
    await expect(page.locator('#clipsPanel')).not.toHaveClass(/folded/);
    expect(await page.evaluate(() => (window as any).panelVideos.every((video: Element, index: number) => video === document.querySelectorAll('#grid video')[index]))).toBe(true);
    await expect(page.locator('#grid .thumb.selected')).toHaveCount(1);
    await page.locator('#settingsBtn').click();
    await page.locator('#foldClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await page.locator('#revealClips').click();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('#settingsScreen')).toBeVisible();
    await expect(page.locator('#screenCommandHost')).toBeHidden();
    await page.locator('#appScreenSelector').selectOption('collection');
    await page.locator('#fsBtn').click();
    await expect(page.locator('#pipelinesPanel')).toBeHidden();
    await expect(page.locator('#clipsPanel')).toBeHidden();
    await page.keyboard.press('f');
    await expect(page.locator('#revealPipelines')).toBeVisible();
    await expect(page.locator('#foldClips')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#revealPipelines').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#foldPipelines')).toBeFocused();
    await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
    expect((await page.locator('#pipelinesPanel').boundingBox())!.width).toBe(240);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 700));
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#choosePipelinesRoot')).toBeInViewport();
    await expect(page.locator('#singleClipAudioDefault')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/panels-settings-narrow.png' });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
