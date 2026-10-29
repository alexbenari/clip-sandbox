import { describe, expect, it, vi } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import { GridContextMenuWorkflow } from '../../src/app/grid-context-menu-workflow.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

type MenuRequest = Parameters<ConstructorParameters<typeof GridContextMenuWorkflow>[0]['menu']['open']>[0];

function contextMenu() {
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4')] }));
  const [alpha] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const grid = Object.assign(new EventSource<{
    contextMenuRequested: { point: { x: number; y: number }; clipId: string | null; fromKeyboard: boolean };
  }>(), {
    getSelectedClipIds: () => [alpha.id],
  });
  const menuRequests: MenuRequest[] = [];
  const zoom = { isOpen: vi.fn(() => false) };
  const trashClips = { start: vi.fn() };
  const refine = { enterFromGrid: vi.fn() };
  const workflow = new GridContextMenuWorkflow({
    pipelineWorkingCopy,
    grid,
    menu: { open: request => { menuRequests.push(request); } },
    zoom,
    fullScreen: { isDocumentFullScreen: () => false },
    addToCollection: { destinationChoices: () => [], addSelectedClips: vi.fn(async () => undefined), openDialog: vi.fn() },
    trashClips,
    refine,
  });
  return { workflow, grid, menuRequests, alpha, zoom, trashClips, refine };
}

describe('GridContextMenuWorkflow', () => {
  it.each([
    ['from the keyboard', true],
    ['with the pointer', false],
  ])('a menu opened %s puts focus on its first item only for keyboard use', (_source, fromKeyboard) => {
    const { grid, menuRequests, alpha } = contextMenu();

    grid.emit('contextMenuRequested', { point: { x: 5, y: 6 }, clipId: alpha.id, fromKeyboard });

    expect(menuRequests.map(request => request.focusFirstItem)).toEqual([fromKeyboard]);
  });

  it('opens nothing while Zoom is open', () => {
    const { grid, menuRequests, alpha, zoom } = contextMenu();
    zoom.isOpen.mockReturnValue(true);

    grid.emit('contextMenuRequested', { point: { x: 0, y: 0 }, clipId: alpha.id, fromKeyboard: false });

    expect(menuRequests).toEqual([]);
  });

  it('enters Zoom edit mode on the clip the menu was opened for when Refine is chosen', () => {
    const { grid, menuRequests, alpha, refine } = contextMenu();
    grid.emit('contextMenuRequested', { point: { x: 5, y: 6 }, clipId: alpha.id, fromKeyboard: false });

    menuRequests[0].onRefine?.();

    expect(refine.enterFromGrid).toHaveBeenCalledWith(alpha.id);
  });

  it('offers no Refine when the menu was opened away from a clip', () => {
    const { grid, menuRequests } = contextMenu();

    grid.emit('contextMenuRequested', { point: { x: 5, y: 6 }, clipId: null, fromKeyboard: false });

    expect(menuRequests[0].onRefine).toBeNull();
  });

  it('starts moving the selection to the Recycle Bin from the menu', () => {
    const { workflow, menuRequests, trashClips } = contextMenu();

    workflow.open({ x: 1, y: 1 });
    menuRequests[0].onTrashSelected();

    expect(trashClips.start).toHaveBeenCalledOnce();
  });
});
