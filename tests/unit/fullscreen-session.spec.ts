import { afterEach, expect, test, vi } from 'vitest';
import { EventSource } from '../../src/app/event-source.js';
import { FullscreenSession } from '../../src/app/fullscreen-session.js';

afterEach(() => { vi.useRealTimers(); });

function fullscreenSession() {
  let active = false;
  const grid = {
    areTitlesHidden: () => false,
    normalizeFullscreenSlots: vi.fn((value: number) => Math.max(2, value)),
    fsApplySlots: vi.fn(),
    rotateVisibleClip: vi.fn(),
    cancelRotation: vi.fn(),
    fsRestore: vi.fn(),
    computeGrid: vi.fn(),
  };
  const reporter = { success: vi.fn() };
  const toolbar = Object.assign(new EventSource<{ toggleFullscreenRequested: void }>(), { setFullscreenButtonState: vi.fn() });
  const session = new FullscreenSession({
    body: document.body,
    grid,
    toolbar,
    titles: { setTitlesHidden: vi.fn() },
    fullScreen: {
      enterFullScreen: () => { active = true; },
      exitFullScreen: () => { active = false; },
      isDocumentFullScreen: () => active,
    },
    clock: { every: (ms, callback) => setInterval(callback, ms), clear: id => clearInterval(id) },
    reporter,
    appText: { fullscreenSlotsText: String },
  });
  return { session, grid, reporter, toolbar, isActive: () => active };
}

test('the toolbar full-screen request enters and leaves full screen', async () => {
  const { session, toolbar, isActive } = fullscreenSession();

  toolbar.emit('toggleFullscreenRequested');
  await Promise.resolve();
  expect(isActive()).toBe(true);
  toolbar.emit('toggleFullscreenRequested');
  await Promise.resolve();
  expect(isActive()).toBe(false);

  session.destroy();
  expect(toolbar.subscriberCount('toggleFullscreenRequested')).toBe(0);
});

test('fullscreen exit and disposal cancel rotation and delayed slot input', async () => {
  vi.useFakeTimers();
  const { session, grid } = fullscreenSession();
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(3000);
  expect(grid.rotateVisibleClip).toHaveBeenCalledTimes(1);
  session.onGlobalKeyDown(new KeyboardEvent('keydown', { key: '3' }));
  await session.exitFullScreen();
  session.onFsChange();
  grid.fsApplySlots.mockClear();
  vi.advanceTimersByTime(4000);
  expect(grid.fsApplySlots).not.toHaveBeenCalled();
  expect(grid.rotateVisibleClip).toHaveBeenCalledTimes(1);
  expect(grid.cancelRotation).toHaveBeenCalled();
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(3000);
  expect(grid.rotateVisibleClip).toHaveBeenCalledTimes(2);
  session.destroy();
  vi.advanceTimersByTime(4000);
  expect(grid.rotateVisibleClip).toHaveBeenCalledTimes(2);
});

test('a typed clip count is normalized by the grid, applied and reported', async () => {
  vi.useFakeTimers();
  const { session, grid, reporter } = fullscreenSession();
  await session.enterFullScreen();
  session.onFsChange();

  session.onGlobalKeyDown(new KeyboardEvent('keydown', { key: '1' }));
  vi.advanceTimersByTime(600);

  expect(grid.normalizeFullscreenSlots).toHaveBeenCalledWith(1);
  expect(grid.fsApplySlots).toHaveBeenLastCalledWith(2);
  expect(reporter.success).toHaveBeenCalledWith('2', 1500);
  session.destroy();
});
