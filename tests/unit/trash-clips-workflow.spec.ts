import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import type { SaveOutcome } from '../../src/app/collection-save-workflow.js';
import { TrashClipsWorkflow } from '../../src/app/trash-clips-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

type PreflightRequest = { text: string; onSave: () => void; onDiscard: () => void; onCancel: () => void };
type ConfirmHandlers = { onConfirm: () => void; onCancel: () => void };

class FakeGrid extends EventSource<{ removeSelectedRequested: string[] }> {
  selectedClipIds: string[] = [];
  getSelectedClipIds() { return this.selectedClipIds; }
  invalidateAllViews = vi.fn();
}

function trashWorkflow({ saveOutcome = 'saved' as SaveOutcome, failingTrashes = [] as string[], unavailable = false } = {}) {
  const pipeline = new Pipeline({
    folderName: 'clips',
    videoSources: [clipSource('alpha.mp4'), clipSource('bravo.mp4')],
    collections: [Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['alpha.mp4', 'bravo.mp4'] })],
  });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const grid = new FakeGrid();
  const [alpha] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  grid.selectedClipIds = [alpha.id];
  const preflights: PreflightRequest[] = [];
  const confirmations: ConfirmHandlers[] = [];
  const dialog = {
    openPreflight: vi.fn((request: PreflightRequest) => { preflights.push(request); }),
    openConfirmForTrashRequest: vi.fn((_request: unknown, handlers: ConfirmHandlers) => { confirmations.push(handlers); }),
    closePreflight: vi.fn(), closeConfirm: vi.fn(), closeAll: vi.fn(),
  };
  const files = {
    trashFiles: vi.fn(async ({ filenames }: { filenames: string[] }) => (unavailable
      ? { code: 'unavailable', results: [] }
      : { code: 'trashed', results: filenames.map(filename => (failingTrashes.includes(filename)
        ? { filename, ok: false, error: new Error('EBUSY') }
        : { filename, ok: true })) })),
  };
  const written: Collection[] = [];
  const entries: { kind: string; message: string; affected?: string }[] = [];
  const toolbar = new EventSource<{ trashSelectedRequested: void }>();
  const zoom = { isOpen: vi.fn(() => false) };
  const folderSelection = { reloadSelection: vi.fn(async () => undefined) };
  const openFolder = new AppSessionState();
  openFolder.setCurrentFolderAccess({ folderPath: 'D:\\clips' });
  const collectionSave = { saveActive: vi.fn(async (): Promise<SaveOutcome> => saveOutcome) };
  const workflow = new TrashClipsWorkflow({
    pipelineWorkingCopy,
    openFolder,
    folders: { isActiveFolder: (folderAccess: { folderPath: string } | null, folderPath: string) => folderAccess?.folderPath === folderPath },
    files,
    fileWriter: { write: vi.fn(async (collection: Collection) => { written.push(collection); return { mode: 'saved' }; }) },
    dialog,
    grid,
    toolbar,
    zoom,
    collectionSave,
    folderSelection,
    collectionView: { refreshToolbar: vi.fn() },
    diagnostics: { logTrashFailures: vi.fn(async () => undefined) },
    reporter: new ActivityReporter({ log: entry => { entries.push(entry); } }),
    appText: new AppText(),
  });
  const makeViewDirty = () => {
    const ids = pipelineWorkingCopy.currentClipSequence!.orderedClips().map(clip => clip.id);
    pipelineWorkingCopy.replaceCurrentOrder([...ids].reverse());
  };
  return {
    workflow, pipeline, pipelineWorkingCopy, grid, dialog, preflights, confirmations, files, written, entries, toolbar, zoom,
    folderSelection, openFolder, collectionSave, makeViewDirty,
  };
}

describe('TrashClipsWorkflow', () => {
  it('asks for confirmation, moves the selected file to the Recycle Bin and removes it from saved collections', async () => {
    const context = trashWorkflow();

    context.toolbar.emit('trashSelectedRequested');
    expect(context.dialog.openPreflight).not.toHaveBeenCalled();
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.entries.at(-1)?.kind).toBe('success'));
    expect(context.files.trashFiles).toHaveBeenCalledWith(expect.objectContaining({ filenames: ['alpha.mp4'] }));
    expect(context.written.map(collection => [collection.filename, collection.orderedClipNames])).toEqual([['picks.txt', ['bravo.mp4']]]);
    expect(context.folderSelection.reloadSelection).toHaveBeenCalledOnce();
  });

  it('reloads a collection view from the collection as rewritten without the trashed clip', async () => {
    const context = trashWorkflow();
    const picks = context.pipeline.getCollectionByFilename('picks.txt');
    const loaded = context.pipelineWorkingCopy.materializeSelection(picks);
    if (loaded?.materialization.kind !== 'loaded') throw new Error('picks.txt should materialize');
    context.pipelineWorkingCopy.activateSelection({ collection: picks, sequence: loaded.materialization.sequence });
    context.grid.selectedClipIds = [loaded.materialization.sequence.orderedClips()[0].id];

    context.workflow.start();
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.folderSelection.reloadSelection).toHaveBeenCalledOnce());
    const [{ collection }] = context.folderSelection.reloadSelection.mock.calls[0] as unknown as [{ collection: Collection | null }];
    expect(collection?.orderedClipNames).toEqual(['bravo.mp4']);
    expect(collection).toBe(context.pipeline.getCollectionByFilename('picks.txt'));
  });

  it('offers to save unsaved changes first, then confirms once the save succeeds', async () => {
    const context = trashWorkflow({ saveOutcome: 'saved' });
    context.makeViewDirty();

    context.workflow.start();
    context.preflights[0].onSave();

    await vi.waitFor(() => expect(context.confirmations).toHaveLength(1));
  });

  it('offers the save again when it fails, without moving anything', async () => {
    const context = trashWorkflow({ saveOutcome: 'failed' });
    context.makeViewDirty();

    context.workflow.start();
    context.preflights[0].onSave();

    await vi.waitFor(() => expect(context.preflights).toHaveLength(2));
    expect(context.confirmations).toHaveLength(0);
    expect(context.files.trashFiles).not.toHaveBeenCalled();
  });

  it('drops the move when Save as Collection is cancelled', async () => {
    const context = trashWorkflow({ saveOutcome: 'cancelled' });
    context.makeViewDirty();

    context.workflow.start();
    context.preflights[0].onSave();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(context.confirmations).toHaveLength(0);
    expect(context.preflights).toHaveLength(1);
  });

  it('drops the move, without asking to confirm, when another folder was opened while its save was pending', async () => {
    const context = trashWorkflow();
    context.makeViewDirty();
    context.collectionSave.saveActive.mockImplementationOnce(async () => {
      context.openFolder.setCurrentFolderAccess({ folderPath: 'D:\\other' });
      return 'saved';
    });

    context.workflow.start();
    context.preflights[0].onSave();

    await vi.waitFor(() => expect(context.entries.at(-1)).toMatchObject({ kind: 'error', affected: 'alpha.mp4' }));
    expect(context.confirmations).toHaveLength(0);
    expect(context.files.trashFiles).not.toHaveBeenCalled();
  });

  it('moves nothing when another folder was opened while the confirmation was showing', async () => {
    const context = trashWorkflow();

    context.workflow.start();
    context.openFolder.setCurrentFolderAccess({ folderPath: 'D:\\other' });
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.entries.at(-1)).toMatchObject({ kind: 'error', affected: 'alpha.mp4' }));
    expect(context.files.trashFiles).not.toHaveBeenCalled();
  });

  it('still moves the files when saving refreshed the same folder', async () => {
    const context = trashWorkflow();
    context.makeViewDirty();
    context.collectionSave.saveActive.mockImplementationOnce(async () => {
      context.openFolder.setCurrentFolderAccess({ folderPath: 'D:\\clips' });
      return 'saved';
    });

    context.workflow.start();
    context.preflights[0].onSave();
    await vi.waitFor(() => expect(context.confirmations).toHaveLength(1));
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.files.trashFiles)
      .toHaveBeenCalledWith(expect.objectContaining({ filenames: ['alpha.mp4'] })));
  });

  it('reports which files could not be moved to the Recycle Bin', async () => {
    const context = trashWorkflow({ failingTrashes: ['alpha.mp4'] });

    context.workflow.start();
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.entries.at(-1)).toMatchObject({ kind: 'error', affected: 'alpha.mp4' }));
    expect(context.folderSelection.reloadSelection).not.toHaveBeenCalled();
  });

  it('reports that the folder must be opened again when disk access is unavailable', async () => {
    const context = trashWorkflow({ unavailable: true });

    context.workflow.start();
    context.confirmations[0].onConfirm();

    await vi.waitFor(() => expect(context.entries.at(-1)).toMatchObject({
      kind: 'error',
      affected: 'alpha.mp4',
      recovery: 'Open the folder again, then retry.',
    }));
  });

  it('treats removing selected clips from the pipeline view as a move to the Recycle Bin, except while Zoom is open', () => {
    const context = trashWorkflow();

    context.zoom.isOpen.mockReturnValue(true);
    context.grid.emit('removeSelectedRequested', context.grid.selectedClipIds);
    expect(context.confirmations).toHaveLength(0);

    context.zoom.isOpen.mockReturnValue(false);
    context.grid.emit('removeSelectedRequested', context.grid.selectedClipIds);
    expect(context.confirmations).toHaveLength(1);
  });
});
