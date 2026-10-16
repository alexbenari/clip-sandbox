import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import type { SaveOutcome } from '../../src/app/collection-save-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import { FolderSelectionWorkflow } from '../../src/app/folder-selection-workflow.js';
import type { IPipelineCatalogEntry } from '../../src/app/pipeline-catalog.js';
import { PipelineSession } from '../../src/app/pipeline-session.js';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { CollectionTextFormat } from '../../src/business-logic/collection-text-format.js';

type UnsavedPromptRequest = { message: string; onSave: () => void; onDiscard: () => void; onCancel: () => void };

function folderFile(name: string, text = ''): File {
  const file = new File([text], name, { type: name.endsWith('.txt') ? 'text/plain' : 'video/mp4' });
  // jsdom's File has no text(); collection files are read through it.
  Object.defineProperty(file, 'text', { value: async () => text });
  return file;
}

function folderWorkflow({ saveOutcome = 'saved' as SaveOutcome } = {}) {
  const folderSession = { folderPath: 'C:/clips' };
  const files = [folderFile('alpha.mp4'), folderFile('bravo.mp4'), folderFile('subset.txt', 'bravo.mp4\n')];
  const folders = {
    pickFolder: vi.fn(async () => ({ folderSession, files, folderName: 'clips' })),
    refreshFolder: vi.fn(async () => ({ folderSession, files, folderName: 'clips' })),
  };
  const pipelineCatalog = {
    openPipelineCatalogEntry: vi.fn(async () => ({ folderSession, files: [folderFile('charlie.mp4')], folderName: 'archive' })),
  };
  const pipelineSession = new PipelineSession();
  const openFolder = new AppSessionState();
  const unsavedPrompts: UnsavedPromptRequest[] = [];
  const unsavedChangesPrompt = { open: vi.fn((request: UnsavedPromptRequest) => { unsavedPrompts.push(request); }), close: vi.fn() };
  const collectionSave = { saveActive: vi.fn(async () => saveOutcome) };
  const collectionView = {
    applySelection: vi.fn((sequence, { collection = null, folderSession: session }: { collection?: unknown; folderSession?: { folderPath: string } | null } = {}) => {
      openFolder.setCurrentFolderSession(session);
      pipelineSession.activateSelection({ collection: collection as never, sequence });
    }),
    refreshSelector: vi.fn(),
    cacheKeyFor: () => 'pipeline',
    activeCacheKey: () => 'pipeline',
  };
  const toolbar = new EventSource<{ browseRequested: void }>();
  const selector = new EventSource<{ selectionRequested: string | null }>();
  const catalog = new EventSource<{ loadRequested: IPipelineCatalogEntry }>();
  const navigation = { activate: vi.fn() };
  const activityLog = { log: vi.fn() };
  const workflow = new FolderSelectionWorkflow({
    pipelineSession,
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
    const ids = pipelineSession.currentClipSequence!.orderedClips().map(clip => clip.id);
    pipelineSession.replaceCurrentOrder([...ids].reverse());
  };
  return { workflow, folders, pipelineSession, unsavedPrompts, unsavedChangesPrompt, collectionSave, collectionView, toolbar, selector, catalog, navigation, activityLog, makeViewDirty };
}

async function openFolder(context: ReturnType<typeof folderWorkflow>) {
  context.toolbar.emit('browseRequested');
  await vi.waitFor(() => expect(context.pipelineSession.pipeline?.folderName).toBe('clips'));
}

describe('FolderSelectionWorkflow', () => {
  it('opens a folder from the toolbar when the view has no unsaved changes', async () => {
    const context = folderWorkflow();

    await openFolder(context);

    expect(context.pipelineSession.currentClipSequence?.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(context.unsavedChangesPrompt.open).not.toHaveBeenCalled();
    expect(context.activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'success', message: 'Loaded pipeline with 2 clips.' }));
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

    await vi.waitFor(() => expect(context.pipelineSession.pipeline?.folderName).toBe('archive'));
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

  it('drops the waiting action when Save as Collection is cancelled', async () => {
    const context = folderWorkflow({ saveOutcome: 'cancelled' });
    await openFolder(context);
    context.makeViewDirty();
    context.toolbar.emit('browseRequested');

    context.unsavedPrompts[0].onSave();

    await vi.waitFor(() => expect(context.workflow.pendingSelectionAction).toBeNull());
    expect(context.folders.pickFolder).toHaveBeenCalledOnce();
    expect(context.unsavedPrompts).toHaveLength(1);
  });

  it('discards unsaved changes and switches to the requested collection', async () => {
    const context = folderWorkflow();
    await openFolder(context);
    context.makeViewDirty();
    context.selector.emit('selectionRequested', 'subset.txt');

    context.unsavedPrompts[0].onDiscard();

    await vi.waitFor(() => expect(context.pipelineSession.activeCollection?.filename).toBe('subset.txt'));
    expect(context.collectionSave.saveActive).not.toHaveBeenCalled();
    expect(context.pipelineSession.currentClipSequence?.clipNamesInOrder()).toEqual(['bravo.mp4']);
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
