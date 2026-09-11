import { afterEach, expect, it, vi } from 'vitest';
import { CollectionScreen } from '../../src/ui/collection-screen.js';

afterEach(() => { document.body.replaceChildren(); });

it('asks the grid to focus its selection and uses Browse only when there is none', () => {
  const grid = { focusSelectedClip: vi.fn(() => false) };
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
