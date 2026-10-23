import { describe, expect, it, vi } from 'vitest';

import { AppSessionState } from '../../src/app/app-session-state.js';
import { EventSource } from '../../src/app/event-source.js';
import { GridContextMenuWorkflow } from '../../src/app/grid-context-menu-workflow.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

type MenuRequest = Parameters<ConstructorParameters<typeof GridContextMenuWorkflow>[0]['menu']['open']>[0];

function contextMenu({ canRefine = true, inspect }: { canRefine?: boolean; inspect?: () => Promise<boolean> } = {}) {
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4')] }));
  const [alpha] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const folderAccess = { folderPath: 'C:/clips' };
  const openFolder = new AppSessionState();
  openFolder.setCurrentFolderAccess(folderAccess);
  const grid = Object.assign(new EventSource<{ contextMenuRequested: { point: { x: number; y: number }; clipId: string | null } }>(), {
    getSelectedClipIds: () => [alpha.id],
  });
  const menuRequests: MenuRequest[] = [];
  const navigation = { activeScreen: { id: 'collection' } };
  const zoom = { isOpen: vi.fn(() => false) };
  const collectionRefinement = { start: vi.fn(async () => undefined) };
  const trashClips = { start: vi.fn() };
  const workflow = new GridContextMenuWorkflow({
    pipelineWorkingCopy,
    openFolder,
    refinementAvailability: { inspect: vi.fn(inspect ?? (async () => canRefine)) },
    grid,
    menu: { open: request => { menuRequests.push(request); } },
    navigation,
    collectionScreenId: 'collection',
    zoom,
    fullScreen: { isDocumentFullScreen: () => false },
    addToCollection: { destinationChoices: () => [], addSelectedClips: vi.fn(async () => undefined), openDialog: vi.fn() },
    trashClips,
    collectionRefinement,
  });
  return { workflow, grid, menuRequests, alpha, navigation, zoom, collectionRefinement, trashClips };
}

describe('GridContextMenuWorkflow', () => {
  it('offers Refine for a clip the original movie can be found for, and starts refinement from it', async () => {
    const { grid, menuRequests, alpha, collectionRefinement } = contextMenu();

    grid.emit('contextMenuRequested', { point: { x: 5, y: 6 }, clipId: alpha.id });

    await vi.waitFor(() => expect(menuRequests).toHaveLength(1));
    expect(menuRequests[0]).toMatchObject({ point: { x: 5, y: 6 }, hasClip: true, refineAvailability: 'available', hasSelection: true });
    menuRequests[0].onRefine();
    expect(collectionRefinement.start).toHaveBeenCalledWith({ folderPath: 'C:/clips', filename: 'alpha.mp4' }, '');
  });

  it('marks Refine as lacking source movie info for a clip without provenance', async () => {
    const { workflow, menuRequests, alpha } = contextMenu({ canRefine: false });

    await workflow.open({ x: 1, y: 1 }, alpha.id);

    expect(menuRequests[0].refineAvailability).toBe('no-source-info');
  });

  it('marks the source movie info as unreadable when checking the clip fails', async () => {
    const { workflow, menuRequests, alpha } = contextMenu({ inspect: async () => { throw new Error('ffprobe failed'); } });

    await workflow.open({ x: 1, y: 1 }, alpha.id);

    expect(menuRequests[0].refineAvailability).toBe('source-info-unreadable');
  });

  it('opens nothing while Zoom is open', async () => {
    const { grid, menuRequests, alpha, zoom } = contextMenu();
    zoom.isOpen.mockReturnValue(true);

    grid.emit('contextMenuRequested', { point: { x: 0, y: 0 }, clipId: alpha.id });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(menuRequests).toEqual([]);
  });

  it('drops a menu whose refine check finished after a newer right-click', async () => {
    const checks: ((available: boolean) => void)[] = [];
    const { workflow, menuRequests, alpha } = contextMenu({ inspect: () => new Promise(resolve => { checks.push(resolve); }) });

    const first = workflow.open({ x: 1, y: 1 }, alpha.id);
    const second = workflow.open({ x: 2, y: 2 }, alpha.id);
    checks[0](true);
    checks[1](true);
    await Promise.all([first, second]);

    expect(menuRequests.map(request => request.point)).toEqual([{ x: 2, y: 2 }]);
  });

  it('drops the menu when another screen became active during the check', async () => {
    const { workflow, menuRequests, alpha, navigation } = contextMenu();

    const opening = workflow.open({ x: 1, y: 1 }, alpha.id);
    navigation.activeScreen = { id: 'settings' };
    await opening;

    expect(menuRequests).toEqual([]);
  });

  it('starts moving the selection to the Recycle Bin from the menu', async () => {
    const { workflow, menuRequests, alpha, trashClips } = contextMenu();

    await workflow.open({ x: 1, y: 1 }, alpha.id);
    menuRequests[0].onTrashSelected();

    expect(trashClips.start).toHaveBeenCalledOnce();
  });
});
