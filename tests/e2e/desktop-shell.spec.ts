import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

for (const nativeFrame of [false, true]) {
  test(`desktop shell keeps native controls clear, restores fullscreen and settles rapid navigation (${nativeFrame ? 'default frame' : 'overlay'})`, async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-desktop-shell-'));
    const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`, ...(nativeFrame ? ['--native-frame'] : [])], env });
    try {
      const page = await app.firstWindow();
      page.setDefaultTimeout(5000);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
      const readOverlay = () => page.evaluate(() => {
        const overlay = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay;
        const rect = overlay?.getTitlebarAreaRect();
        return { visible: overlay?.visible ?? false, right: rect ? rect.x + rect.width : innerWidth };
      });
      await expect(page.locator('#appScreenSelector')).toBeVisible();
      expect(await page.locator('#globalAppBar button:visible').evaluateAll(nodes => nodes.map(node => node.id))).toEqual(['activityIndicatorBtn', 'keyboardMapBtn', 'settingsBtn']);
      await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and Errors: Ready');
      expect((await readOverlay()).visible).toBe(process.platform === 'win32' && !nativeFrame);
      for (const width of [1440, 800]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, width === 1440 ? 900 : 650), width);
        await expect(page.locator('#activityIndicatorBtn')).toBeInViewport();
        const target = await page.locator('#activityIndicatorBtn').boundingBox();
        expect(target!.height).toBeGreaterThanOrEqual(32);
        expect(target!.width).toBeGreaterThanOrEqual(100);
        const overlay = await readOverlay();
        const right = overlay.visible ? overlay.right : width;
        for (const id of ['appScreenSelector', 'keyboardMapBtn', 'settingsBtn', 'activityIndicatorBtn']) {
          const box = await page.locator(`#${id}`).boundingBox();
          expect(box!.x + box!.width).toBeLessThanOrEqual(right);
          expect(await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const commands = await page.locator('#toolbar').boundingBox();
        const collection = await page.locator('#activeCollectionName').boundingBox();
        if (width === 1440) {
          expect(Math.abs(collection!.x + collection!.width / 2 - commands!.x - commands!.width / 2)).toBeLessThan(2);
        } else {
          expect(commands!.height).toBeLessThanOrEqual(160);
        }
        await page.screenshot({ path: `test-results/desktop-${nativeFrame ? 'frame' : 'overlay'}-${width}.png` });
      }
      const samples = await page.evaluate(async () => {
        const selector = document.querySelector<HTMLSelectElement>('#appScreenSelector')!;
        const samples: { screen: string; commandsHidden: boolean; visibleScreens: number; focused: boolean }[] = [];
        for (let i = 0; i < 16; i++) {
          selector.value = i % 2 ? 'collection' : 'settings';
          selector.dispatchEvent(new Event('change'));
          await new Promise(requestAnimationFrame);
          samples.push({ screen: selector.value, commandsHidden: document.querySelector<HTMLElement>('#screenCommandHost')!.hidden === true,
            visibleScreens: [...document.querySelectorAll<HTMLElement>('#mainScreenHost > section')].filter(el => !el.hidden && !el.inert).length,
            focused: document.activeElement?.id === (selector.value === 'settings' ? 'pipelinesRootPath' : 'pickBtn') });
        }
        return samples;
      });
      expect(samples.every(sample => sample.visibleScreens === 1 && sample.focused && sample.commandsHidden === (sample.screen === 'settings'))).toBe(true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#foldPipelines').click();
      await page.locator('#foldClips').click();
      await expect(page.locator('#workspaceRow')).toHaveAttribute('data-moving', 'false');
      expect(await page.locator('.side-panel').evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true);
      await page.locator('#keyboardMapBtn').click();
      await expect(page.locator('#keyboardMapHeading')).toBeFocused();
      expect(await page.locator('#globalUtilityHost').evaluate(el => el.getAnimations().length)).toBe(0);
      await page.locator('#activityIndicatorBtn').click();
      await expect(page.getByRole('region', { name: 'Activity history' })).toBeFocused();
      await page.keyboard.press('Escape');
      await page.locator('#fsBtn').click();
      await expect(page.locator('body')).toHaveClass(/fs-active/);
      for (const selector of ['#globalAppBar', '#screenCommandHost', '#pipelinesPanel', '#clipsPanel', '#globalUtilityHost']) await expect(page.locator(selector)).toBeHidden();
      await page.keyboard.press('f');
      await expect(page.locator('#globalAppBar')).toBeVisible();
      await expect(page.locator('#fsBtn svg')).toHaveCount(1);
      for (const panelsOpen of [true, false]) {
        await page.locator(panelsOpen ? '#revealPipelines' : '#foldPipelines').click();
        await page.locator(panelsOpen ? '#revealClips' : '#foldClips').click();
        for (const width of [1440, 1200, 1000, 800]) {
          await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 900), width);
          const dropdown = await page.locator('#activeCollectionName').boundingBox();
          for (const id of ['pickBtn', 'orderMenuBtn', 'toggleTitlesBtn', 'fsBtn']) {
            await expect(page.locator(`#${id} span`)).toBeVisible();
            const button = await page.locator(`#${id}`).boundingBox();
            const overlaps = button!.x < dropdown!.x + dropdown!.width && button!.x + button!.width > dropdown!.x
              && button!.y < dropdown!.y + dropdown!.height && button!.y + button!.height > dropdown!.y;
            expect(overlaps, `${id} must not be covered by the collection selector at ${width}px`).toBe(false);
          }
        }
      }
      await expect(page.locator('#revealPipelines')).toBeVisible();
      await expect(page.locator('#revealClips')).toBeVisible();
      await expect(page.locator('#globalUtilityHost')).toBeHidden();
      await expect(page.locator('#activityIndicatorBtn')).toHaveAttribute('aria-expanded', 'false');
      await page.locator('#keyboardMapBtn').click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#keyboardMapBtn')).toBeFocused();
    } finally {
      await app.close();
      await fs.rm(profile, { recursive: true, force: true });
    }
  });
}

