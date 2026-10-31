import { afterEach, expect, it, vi } from 'vitest';
import { CollectionScreen } from '../../src/ui/collection-screen.js';
import { FakePreviewHolds } from '../support/preview-holds.js';

afterEach(() => { document.body.replaceChildren(); });

function collectionGrid() {
  const grid = {
    focusSelectedClip: vi.fn(() => false), beginWorkspaceResize: vi.fn(), endWorkspaceResize: vi.fn(),
    previews: new FakePreviewHolds(),
    holdPreviews: () => grid.previews.holdPreviews(),
  };
  return grid;
}

const screenWith = (grid: ReturnType<typeof collectionGrid>) =>
  new CollectionScreen(document.createElement('section'), document.createElement('nav'), grid, { focusBrowse: vi.fn() });

it('holds its grid’s previews until it is first shown', () => {
  const grid = collectionGrid();
  const screen = screenWith(grid);
  expect(grid.previews.count).toBe(1);

  screen.onActivate();

  expect(grid.previews.count).toBe(0);
});

it('holds its grid’s previews once while another screen is shown, and releases them on return', () => {
  const grid = collectionGrid();
  const screen = screenWith(grid);
  screen.onActivate();

  screen.onDeactivate();
  screen.onDeactivate();
  expect(grid.previews.count).toBe(1);
  screen.onActivate();
  expect(grid.previews.count).toBe(0);
});

it('passes workspace resizes to its grid', () => {
  const grid = collectionGrid();
  const screen = new CollectionScreen(document.createElement('section'), document.createElement('nav'), grid, { focusBrowse: vi.fn() });

  screen.onBoundsChanging(900, 240);
  screen.onBoundsSettled();

  expect(grid.beginWorkspaceResize).toHaveBeenCalledWith(900, 240);
  expect(grid.endWorkspaceResize).toHaveBeenCalledOnce();
});

it('reports keys pressed while it is active', () => {
  const screen = new CollectionScreen(document.createElement('section'), document.createElement('nav'), collectionGrid(), { focusBrowse: vi.fn() });
  const keyPressed = vi.fn();
  screen.on('keyPressed', keyPressed);
  const key = new KeyboardEvent('keydown', { key: 'z' });

  screen.onKeyDown(key);

  expect(keyPressed).toHaveBeenCalledWith(key);
});

it('asks the grid to focus its selection and uses Browse only when there is none', () => {
  const grid = collectionGrid();
  const toolbar = { focusBrowse: vi.fn() };
  const screen = new CollectionScreen(document.createElement('section'), document.createElement('nav'), grid, toolbar);
  screen.focusInitial();
  expect(grid.focusSelectedClip).toHaveBeenCalledOnce();
  expect(toolbar.focusBrowse).toHaveBeenCalledOnce();
  grid.focusSelectedClip.mockReturnValue(true);
  screen.focusInitial();
  expect(grid.focusSelectedClip).toHaveBeenCalledTimes(2);
  expect(toolbar.focusBrowse).toHaveBeenCalledOnce();
});
