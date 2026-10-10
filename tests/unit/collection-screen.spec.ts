import { afterEach, expect, it, vi } from 'vitest';
import { CollectionScreen } from '../../src/ui/collection-screen.js';

afterEach(() => { document.body.replaceChildren(); });

const collectionGrid = () => ({ focusSelectedClip: vi.fn(() => false), beginWorkspaceResize: vi.fn(), endWorkspaceResize: vi.fn() });

it('passes workspace resizes to its grid', () => {
  const grid = collectionGrid();
  const screen = new CollectionScreen(document.createElement('section'), document.createElement('nav'), grid, { focusBrowse: vi.fn() });

  screen.onBoundsChanging(900, 240);
  screen.onBoundsSettled();

  expect(grid.beginWorkspaceResize).toHaveBeenCalledWith(900, 240);
  expect(grid.endWorkspaceResize).toHaveBeenCalledOnce();
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
