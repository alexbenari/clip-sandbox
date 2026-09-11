import { afterEach, expect, test, vi } from 'vitest';
import { FullscreenSession } from '../../src/app/fullscreen-session.js';

afterEach(() => { vi.useRealTimers(); });

test('fullscreen exit and disposal cancel rotation and delayed slot input', async () => {
  vi.useFakeTimers();
  let active = false;
  const rotate = vi.fn();
  const cancel = vi.fn();
  const applySlots = vi.fn();
  const session = new FullscreenSession({
    body: document.body, isFullscreen: () => active,
    setFullscreenButtonState: vi.fn(), isTitlesHidden: () => false, setTitlesHidden: vi.fn(),
    enterFullScreenAdapter: () => { active = true; }, exitFullScreenAdapter: () => { active = false; },
    fsApplySlots: applySlots, fsRestore: vi.fn(), computeGrid: vi.fn(),
    rotateVisibleClip: rotate, cancelRotation: cancel, showStatus: vi.fn(),
    layoutRules: { normalizeFullscreenSlots: value => value },
    appText: { fullscreenSlotsText: String },
    every: (ms, callback) => setInterval(callback, ms), clearClock: id => clearInterval(id),
  });
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(3000);
  expect(rotate).toHaveBeenCalledTimes(1);
  session.onGlobalKeyDown(new KeyboardEvent('keydown', { key: '3' }));
  await session.exitFullScreen();
  session.onFsChange();
  applySlots.mockClear();
  vi.advanceTimersByTime(4000);
  expect(applySlots).not.toHaveBeenCalled();
  expect(rotate).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalled();
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(3000);
  expect(rotate).toHaveBeenCalledTimes(2);
  session.destroy();
  vi.advanceTimersByTime(4000);
  expect(rotate).toHaveBeenCalledTimes(2);
});
