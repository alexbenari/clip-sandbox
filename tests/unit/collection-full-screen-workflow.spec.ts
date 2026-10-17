import { afterEach, expect, test, vi } from 'vitest';
import { EventSource } from '../../src/app/event-source.js';
import { CollectionFullScreenWorkflow } from '../../src/app/collection-full-screen-workflow.js';

afterEach(() => { vi.useRealTimers(); });

function collectionFullScreen() {
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
  const layout = { setFullScreenLayout: vi.fn() };
  const toolbar = Object.assign(new EventSource<{ toggleFullscreenRequested: void }>(), { setFullscreenButtonState: vi.fn() });
  const session = new CollectionFullScreenWorkflow({
    layout,
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
  return { session, grid, reporter, toolbar, layout, isActive: () => active };
}

test('the toolbar full-screen request enters and leaves full screen', async () => {
  const { session, toolbar, isActive } = collectionFullScreen();

  toolbar.emit('toggleFullscreenRequested');
  await Promise.resolve();
  expect(isActive()).toBe(true);
  toolbar.emit('toggleFullscreenRequested');
  await Promise.resolve();
  expect(isActive()).toBe(false);

  session.destroy();
  toolbar.emit('toggleFullscreenRequested');
  await Promise.resolve();
  expect(isActive()).toBe(false);
});

// Long enough for any rotation interval or typing pause the workflow uses.
const A_WHILE_MS = 60_000;

test('fullscreen exit and disposal cancel rotation and delayed slot input', async () => {
  vi.useFakeTimers();
  const { session, grid } = collectionFullScreen();
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(A_WHILE_MS);
  expect(grid.rotateVisibleClip).toHaveBeenCalled();
  session.onGlobalKeyDown(new KeyboardEvent('keydown', { key: '3' }));
  await session.exitFullScreen();
  session.onFsChange();
  grid.fsApplySlots.mockClear();
  grid.rotateVisibleClip.mockClear();
  vi.advanceTimersByTime(A_WHILE_MS);
  expect(grid.fsApplySlots).not.toHaveBeenCalled();
  expect(grid.rotateVisibleClip).not.toHaveBeenCalled();
  expect(grid.cancelRotation).toHaveBeenCalled();
  await session.enterFullScreen();
  session.onFsChange();
  vi.advanceTimersByTime(A_WHILE_MS);
  expect(grid.rotateVisibleClip).toHaveBeenCalled();
  session.destroy();
  grid.rotateVisibleClip.mockClear();
  vi.advanceTimersByTime(A_WHILE_MS);
  expect(grid.rotateVisibleClip).not.toHaveBeenCalled();
});

test('the window layout follows full screen in both directions', async () => {
  const { session, layout } = collectionFullScreen();
  await session.enterFullScreen();
  session.onFsChange();
  await session.exitFullScreen();
  session.onFsChange();

  expect(layout.setFullScreenLayout.mock.calls).toEqual([[true], [false]]);
  session.destroy();
});

test('a typed clip count is normalized by the grid, applied and reported', async () => {
  vi.useFakeTimers();
  const { session, grid, reporter } = collectionFullScreen();
  await session.enterFullScreen();
  session.onFsChange();

  session.onGlobalKeyDown(new KeyboardEvent('keydown', { key: '1' }));
  vi.advanceTimersByTime(A_WHILE_MS);

  expect(grid.normalizeFullscreenSlots).toHaveBeenCalledWith(1);
  expect(grid.fsApplySlots).toHaveBeenLastCalledWith(2);
  expect(reporter.success).toHaveBeenCalledWith('2', expect.any(Number));
  session.destroy();
});
