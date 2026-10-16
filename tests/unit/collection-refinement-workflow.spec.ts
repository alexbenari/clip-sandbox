import { describe, expect, it, vi } from 'vitest';

import { AppSessionState } from '../../src/app/app-session-state.js';
import type { CollectionClipSourceResult } from '../../src/app/collection-clip-refinement.js';
import { CollectionRefinementWorkflow } from '../../src/app/collection-refinement-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import type { CapturedRangeId } from '../../src/domain/captured-range.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const movieSource = { name: 'Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_0123456789abcdef') };

const resolvedSource: CollectionClipSourceResult = {
  kind: 'resolved',
  source: movieSource,
  range: { start: { frameIndex: 1, frameInfoHash: '0000000000000001' }, end: { frameIndex: 2, frameInfoHash: '0000000000000002' } },
};

class FakeRefineScreen extends EventSource<{ backRequested: CapturedRangeId | null }> {
  readonly id = 'collection-refine';
  showPreparation = vi.fn();
}

function refinementWorkflow({ dirty = false, lookup = async (): Promise<CollectionClipSourceResult> => resolvedSource } = {}) {
  const navigation = { activeScreen: { id: 'collection' }, activate: vi.fn((id: string) => { navigation.activeScreen = { id }; }) };
  const session = {
    setExtractionDestination: vi.fn(),
    openCollectionSource: vi.fn(async () => undefined),
    importCollectionRange: vi.fn(async () => ({ kind: 'started' as const, session: {} as never })),
    abandonRefinement: vi.fn(() => null),
    beginRefinement: vi.fn(async () => ({ kind: 'rejected' as const, message: 'Wait for the movie to finish opening.' })),
  };
  const folderAccess = { folderPath: 'C:/clips' };
  const openFolder = new AppSessionState();
  openFolder.setCurrentFolderAccess(folderAccess);
  const refineScreen = new FakeRefineScreen();
  const refinedClipList = new EventSource<{ refineRequested: CapturedRangeId }>();
  const reporter = { failure: vi.fn() };
  const workflow = new CollectionRefinementWorkflow({
    refinementSession: session,
    sourceLookup: { resolve: vi.fn(lookup) },
    refineScreen,
    refinedClipList,
    navigation,
    collectionScreenId: 'collection',
    pipelineWorkingCopy: { hasDirtyClipSequenceChanges: dirty, activeCollectionFilename: () => 'picks.txt' },
    openFolder,
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
    reporter,
  });
  return { workflow, session, navigation, refineScreen, refinedClipList, reporter };
}

const request = { folderPath: 'C:/clips', filename: 'picks-001.mp4' };

describe('CollectionRefinementWorkflow', () => {
  it('finds the original movie, opens it on the Refine screen and imports the clip range', async () => {
    const { workflow, session, navigation, refineScreen } = refinementWorkflow();

    await workflow.start(request, 'picks.txt');

    expect(session.setExtractionDestination).toHaveBeenCalledWith({ kind: 'collection', folderPath: 'C:/clips', collectionFilename: 'picks.txt' });
    expect(navigation.activeScreen.id).toBe('collection-refine');
    expect(session.openCollectionSource).toHaveBeenCalledWith(movieSource);
    expect(session.importCollectionRange).toHaveBeenCalledOnce();
    expect(refineScreen.showPreparation).toHaveBeenLastCalledWith(null);
  });

  it('refuses to start while the view has unsaved changes', async () => {
    const { workflow, session, reporter } = refinementWorkflow({ dirty: true });

    await workflow.start(request, 'picks.txt');

    expect(reporter.failure).toHaveBeenCalledWith('Save or discard the current changes before refining a clip.');
    expect(session.setExtractionDestination).not.toHaveBeenCalled();
  });

  it('returns to Collection when the user cancels the source lookup', async () => {
    const { workflow, session, navigation } = refinementWorkflow({ lookup: async () => ({ kind: 'cancelled' }) });

    await workflow.start(request, 'picks.txt');

    expect(navigation.activeScreen.id).toBe('collection');
    expect(session.openCollectionSource).not.toHaveBeenCalled();
  });

  it('returns to Collection, leaving the destination alone, when the selected collection changed during the lookup', async () => {
    const { workflow, session, navigation, refineScreen, reporter } = refinementWorkflow();

    await workflow.start(request, 'other.txt');

    expect(session.openCollectionSource).not.toHaveBeenCalled();
    expect(session.setExtractionDestination).not.toHaveBeenCalled();
    expect(navigation.activeScreen.id).toBe('collection');
    expect(refineScreen.showPreparation).toHaveBeenLastCalledWith(null);
    expect(reporter.failure).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });

  it('ignores a lookup that finishes after the user went Back', async () => {
    let finishLookup: (result: CollectionClipSourceResult) => void = () => undefined;
    const { workflow, session, refineScreen } = refinementWorkflow({ lookup: () => new Promise(resolve => { finishLookup = resolve; }) });

    const started = workflow.start(request, 'picks.txt');
    refineScreen.emit('backRequested', null);
    finishLookup(resolvedSource);
    await started;

    expect(session.openCollectionSource).not.toHaveBeenCalled();
    expect(refineScreen.showPreparation).toHaveBeenLastCalledWith(null);
  });

  it('reports a rejected request to refine the clip again', async () => {
    const { refinedClipList, reporter } = refinementWorkflow();

    refinedClipList.emit('refineRequested', 'range-1' as CapturedRangeId);

    await vi.waitFor(() => expect(reporter.failure).toHaveBeenCalledWith('Wait for the movie to finish opening.'));
  });
});
