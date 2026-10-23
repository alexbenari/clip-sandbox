import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resizeContent, visibleBox, type Box } from './support/app.js';

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function centerX(box: Box): number {
  return box.x + box.width / 2;
}

for (const nativeFrame of [false, true]) {
  test(`desktop shell keeps native controls clear, restores fullscreen and settles rapid navigation (${nativeFrame ? 'default frame' : 'overlay'})`, async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-desktop-shell-'));
    const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`, ...(nativeFrame ? ['--native-frame'] : [])], env });
    try {
      const page = await app.firstWindow();
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
      // `right` is where the app's own controls must end: the native window controls' left edge, or the window edge.
      const readOverlay = () => page.evaluate(() => {
        const overlay = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay;
        const rect = overlay?.visible ? overlay.getTitlebarAreaRect() : null;
        return { visible: overlay?.visible ?? false, right: rect ? rect.x + rect.width : innerWidth };
      });
      const boxOf = (selector: string) => visibleBox(page.locator(selector));
      const expectAppBarFits = async (width: number, height: number) => {
        await resizeContent(app, page, width, height);
        await expect(page.locator('#activityIndicatorBtn')).toBeInViewport();
        const target = await boxOf('#activityIndicatorBtn');
        // WCAG 2.2 target size (minimum): at least 24 by 24 CSS pixels.
        expect(target.height).toBeGreaterThanOrEqual(24);
        expect(target.width).toBeGreaterThanOrEqual(24);
        const { right } = await readOverlay();
        for (const id of ['appScreenSelector', 'keyboardMapBtn', 'settingsBtn', 'activityIndicatorBtn']) {
          const box = await boxOf(`#${id}`);
          expect(box.x + box.width).toBeLessThanOrEqual(right);
          expect(await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/desktop-${nativeFrame ? 'frame' : 'overlay'}-${width}.png` });
      };
      await expect(page.locator('#appScreenSelector')).toBeVisible();
      await expect.poll(() => page.locator('#appScreenSelector').inputValue()).toBe('gif-extraction');
      await expect(page.locator('#appScreenSelector')).toHaveAccessibleName('Workspace');
      await page.locator('#appScreenSelector').selectOption('collection');
      await expect(page.locator('#clipsPanel')).toBeHidden();
      expect(await page.locator('#globalAppBar button:visible').evaluateAll(nodes => nodes.map(node => node.id))).toEqual(['activityIndicatorBtn', 'keyboardMapBtn', 'settingsBtn']);
      await expect(page.locator('#activityIndicatorBtn')).toHaveAccessibleName('Activity and errors: Ready');
      expect((await readOverlay()).visible).toBe(process.platform === 'win32' && !nativeFrame);
      await expectAppBarFits(1440, 900);
      expect(Math.abs(centerX(await boxOf('#activeCollectionName')) - centerX(await boxOf('#toolbar')))).toBeLessThanOrEqual(5);
      await expectAppBarFits(800, 650);
      expect((await boxOf('#toolbar')).height).toBeLessThanOrEqual(160);
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
      const unsettled = samples.filter(sample => sample.visibleScreens !== 1 || !sample.focused || sample.commandsHidden !== (sample.screen === 'settings'));
      expect(unsettled, 'screens that did not settle after a rapid switch').toEqual([]);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#foldPipelines').click();
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
        for (const width of [1440, 1200, 1000, 800]) {
          await resizeContent(app, page, width, 900);
          const dropdown = await boxOf('#activeCollectionName');
          for (const id of ['pickBtn', 'orderMenuBtn', 'toggleTitlesBtn', 'fsBtn']) {
            await expect(page.locator(`#${id} span`)).toBeVisible();
            expect(overlaps(await boxOf(`#${id}`), dropdown), `${id} must not be covered by the collection selector at ${width}px`).toBe(false);
          }
        }
      }
      await expect(page.locator('#revealPipelines')).toBeVisible();
      await expect(page.locator('#clipsPanel')).toBeHidden();
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

