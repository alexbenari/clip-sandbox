import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import type { SaveOutcome } from '../../src/app/collection-save-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import type { FolderAccess } from '../../src/app/folder-access.js';
import { FolderSelectionWorkflow } from '../../src/app/folder-selection-workflow.js';
import type { IPipelineCatalogEntry } from '../../src/app/pipeline-catalog.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { CollectionTextFormat } from '../../src/business-logic/collection-text-format.js';
import { folderEntry } from '../support/clip-source-fixtures.js';

type UnsavedPromptRequest = { message: string; onSave: () => void; onDiscard: () => void; onCancel: () => void };

function folderFile(name: string, text?: string) {
  return folderEntry(name, { text });
}

function folderWorkflow({ saveOutcome = 'saved' as SaveOutcome } = {}) {
  const folderAccess = { folderPath: 'C:/clips' };
  const files = [folderFile('alpha.mp4'), folderFile('bravo.mp4'), folderFile('subset.txt', 'bravo.mp4\n')];
  const folders = {
    pickFolder: vi.fn(async () => ({ folderAccess, files, folderName: 'clips' })),
    refreshFolder: vi.fn(async () => ({ folderAccess, files, folderName: 'clips' })),
  };
  const pipelineCatalog = {
    openPipelineCatalogEntry: vi.fn(async () => ({ folderAccess, files: [folderFile('charlie.mp4')], folderName: 'archive' })),
  };
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  const openFolder = new AppSessionState();
  const unsavedPrompts: UnsavedPromptRequest[] = [];
  const unsavedChangesPrompt = { open: vi.fn((request: UnsavedPromptRequest) => { unsavedPrompts.push(request); }), close: vi.fn() };
  const collectionSave = { saveActive: vi.fn(async () => saveOutcome) };
  const collectionView = {
    applySelection: vi.fn((sequence, { collection = null, folderAccess: session }: { collection?: unknown; folderAccess?: { folderPath: string } | null } = {}) => {
      openFolder.setCurrentFolderAccess(session);
      pipelineWorkingCopy.activateSelection({ collection: collection as never, sequence });
    }),
    refreshSelector: vi.fn(),
    cacheKeyFor: () => 'pipeline',
    activeCacheKey: () => 'pipeline',
  };
  const toolbar = new EventSource<{ browseRequested: void }>();
  const selector = new EventSource<{ selectionRequested: string | null }>();
  const catalog = new EventSource<{ loadRequested: IPipelineCatalogEntry }>();
  const navigation = { activate: vi.fn() };
  const activityLog = { log: vi.fn(), resolveError: vi.fn() };
  const sourceMovies = { readFolderClips: vi.fn(async (_folder: FolderAccess) => undefined) };
  const workflow = new FolderSelectionWorkflow({
    pipelineWorkingCopy,
    openFolder,
    folders,
    pipelineCatalog,
    pipelineFactory: new PipelineFactory(),
    collectionFormat: new CollectionTextFormat(),
    diagnostics: { logInvalidDescription: vi.fn(), logRuntimeError: vi.fn() },
    grid: { invalidateView: vi.fn(), invalidateAllViews: vi.fn(), retagActiveView: vi.fn() },
    collectionView,
    missingClipsPrompt: { showConflict: vi.fn(), hide: vi.fn() },
    unsavedChangesPrompt,
    collectionSave,
    sourceMovies,
    navigation,
    collectionScreenId: 'collection',
    settings: { whenLoaded: async () => undefined },
    toolbar,
    selector,
    catalog,
    reporter: new ActivityReporter(activityLog),
    appText: new AppText(),
  });
  const makeViewDirty = () => {
    const ids = pipelineWorkingCopy.currentClipSequence!.orderedClips().map(clip => clip.id);
    pipelineWorkingCopy.replaceCurrentOrder([...ids].reverse());
  };
  return { workflow, folders, pipelineWorkingCopy, unsavedPrompts, unsavedChangesPrompt, collectionSave, collectionView, toolbar, selector, catalog, navigation, activityLog, makeViewDirty, sourceMovies, folderAccess, files };
}

// A dropped continuation leaves nothing to wait for, so the test lets every queued promise callback run first.
function queuedContinuations(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function openFolder(context: ReturnType<typeof folderWorkflow>) {
  context.toolbar.emit('browseRequested');
  await vi.waitFor(() => expect(context.pipelineWorkingCopy.pipeline?.folderName).toBe('clips'));
}

describe('FolderSelectionWorkflow', () => {
  it('opens a folder from the toolbar when the view has no unsaved changes', async () => {
    const context = folderWorkflow();

    await openFolder(context);

    expect(context.pipelineWorkingCopy.currentClipSequence?.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(context.unsavedChangesPrompt.open).not.toHaveBeenCalled();
    expect(context.activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'success', message: 'Loaded pipeline with 2 clips.' }));
  });

  it('reads the source movies of the clips in a newly opened folder', async () => {
    const context = folderWorkflow();

    await openFolder(context);

    expect(context.sourceMovies.readFolderClips.mock.calls).toEqual([[context.folderAccess]]);
  });

  it('reads the source movies again from the folder that switching views listed again', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    const relistedFolder = { folderPath: 'C:/clips' };
    context.folders.refreshFolder.mockResolvedValueOnce({ folderAccess: relistedFolder, files: context.files, folderName: 'clips' });

    context.selector.emit('selectionRequested', 'subset.txt');

    await vi.waitFor(() => expect(context.sourceMovies.readFolderClips).toHaveBeenCalledTimes(2));
    expect(context.sourceMovies.readFolderClips.mock.calls[1][0]).toBe(relistedFolder);
  });

  it('reports how many clips a chosen collection loaded', async () => {
    const context = folderWorkflow();
    await openFolder(context);

    context.selector.emit('selectionRequested', 'subset.txt');

    await vi.waitFor(() => expect(context.activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'success', message: 'Loaded collection with 1 clip.' })));
  });

  it('asks before leaving unsaved changes, and forgets the request when the prompt is cancelled', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    context.makeViewDirty();

    context.toolbar.emit('browseRequested');
    expect(context.workflow.pendingSelectionAction).toEqual({ type: 'browse-folder' });
    expect(context.unsavedPrompts[0].message).toContain('browsing to another folder');
    context.unsavedPrompts[0].onCancel();

    expect(context.workflow.pendingSelectionAction).toBeNull();
    expect(context.folders.pickFolder).toHaveBeenCalledOnce();
  });

  it('saves first, then continues the waiting action, when the user chooses Save and the save succeeds', async () => {
    const context = folderWorkflow({ saveOutcome: 'saved' });
    await openFolder(context);
    context.makeViewDirty();
    context.catalog.emit('loadRequested', { id: 'catalog_archive_0001', name: 'archive' });

    context.unsavedPrompts[0].onSave();

    await vi.waitFor(() => expect(context.pipelineWorkingCopy.pipeline?.folderName).toBe('archive'));
    expect(context.collectionSave.saveActive).toHaveBeenCalledOnce();
    expect(context.navigation.activate).toHaveBeenCalledWith('collection');
    expect(context.workflow.pendingSelectionAction).toBeNull();
  });

  it('asks again and keeps the waiting action when the save fails', async () => {
    const context = folderWorkflow({ saveOutcome: 'failed' });
    await openFolder(context);
    context.makeViewDirty();
    context.toolbar.emit('browseRequested');

    context.unsavedPrompts[0].onSave();

    await vi.waitFor(() => expect(context.unsavedPrompts).toHaveLength(2));
    expect(context.workflow.pendingSelectionAction).toEqual({ type: 'browse-folder' });
    expect(context.folders.pickFolder).toHaveBeenCalledOnce();
  });

  it('drops the waiting action when Save as collection is cancelled', async () => {
    const context = folderWorkflow({ saveOutcome: 'cancelled' });
    await openFolder(context);
    context.makeViewDirty();
    context.toolbar.emit('browseRequested');

    context.unsavedPrompts[0].onSave();

    await vi.waitFor(() => expect(context.workflow.pendingSelectionAction).toBeNull());
    expect(context.folders.pickFolder).toHaveBeenCalledOnce();
    expect(context.unsavedPrompts).toHaveLength(1);
  });

  it('does not resume an earlier request once a newer one has been answered', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    context.makeViewDirty();
    let finishSave: (outcome: SaveOutcome) => void = () => undefined;
    const earlierSave = new Promise<SaveOutcome>(resolve => { finishSave = resolve; });
    context.collectionSave.saveActive.mockImplementationOnce(() => earlierSave);
    context.toolbar.emit('browseRequested');
    context.unsavedPrompts[0].onSave();
    context.selector.emit('selectionRequested', 'subset.txt');

    context.unsavedPrompts[1].onDiscard();
    await vi.waitFor(() => expect(context.pipelineWorkingCopy.activeCollection?.filename).toBe('subset.txt'));
    const folderPicks = context.folders.pickFolder.mock.calls.length;
    finishSave('saved');
    await queuedContinuations();

    expect(context.folders.pickFolder).toHaveBeenCalledTimes(folderPicks);
  });

  it('discards unsaved changes and switches to the requested collection', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    context.makeViewDirty();
    context.selector.emit('selectionRequested', 'subset.txt');

    context.unsavedPrompts[0].onDiscard();

    await vi.waitFor(() => expect(context.pipelineWorkingCopy.activeCollection?.filename).toBe('subset.txt'));
    expect(context.collectionSave.saveActive).not.toHaveBeenCalled();
    expect(context.pipelineWorkingCopy.currentClipSequence?.clipNamesInOrder()).toEqual(['bravo.mp4']);
  });

  it('only refreshes the selector when the requested view is already showing', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    context.collectionView.refreshSelector.mockClear();

    context.selector.emit('selectionRequested', null);

    expect(context.collectionView.refreshSelector).toHaveBeenCalledOnce();
    expect(context.folders.refreshFolder).not.toHaveBeenCalled();
  });
});
