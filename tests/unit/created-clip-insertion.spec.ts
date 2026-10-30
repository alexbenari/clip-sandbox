import { describe, expect, it, vi } from 'vitest';

import { AppSessionState } from '../../src/app/app-session-state.js';
import { CreatedClipInsertion } from '../../src/app/created-clip-insertion.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Clip } from '../../src/domain/clip.js';
import type { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

// The grid keeps a view per key; a view is shown again from that cache unless it was invalidated.
class FakeGrid {
  readonly cached = new Map<string, string[]>();
  shown: string[] = [];
  selectedClipId: string | null = null;
  setSelectedClipId(clipId: string) { this.selectedClipId = clipId; }
  invalidateView(cacheKey: string) { this.cached.delete(cacheKey); }
  renderCollection(sequence: ClipSequence, { cacheKey }: { cacheKey: string }) {
    if (!this.cached.has(cacheKey)) this.cached.set(cacheKey, sequence.clipNamesInOrder());
    this.shown = this.cached.get(cacheKey)!;
  }
}

function insertionIn(collectionFilename: string | null) {
  const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['charlie.mp4', 'bravo.mp4', 'alpha.mp4'] });
  const pipeline = new Pipeline({ folderName: 'clips', videoSources: ['alpha.mp4', 'bravo.mp4', 'charlie.mp4'].map(name => clipSource(name)), collections: [picks] });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const grid = new FakeGrid();
  const cacheKey = () => (pipelineWorkingCopy.activeCollection ? `collection:${pipelineWorkingCopy.activeCollectionFilename()}` : 'pipeline');
  const collectionView = {
    applySelection: (sequence: ClipSequence, { collection = null }: { collection?: Collection | null } = {}) => {
      pipelineWorkingCopy.activateSelection({ collection, sequence });
      grid.renderCollection(sequence, { cacheKey: cacheKey() });
    },
    activeCacheKey: cacheKey,
    refreshSelector: vi.fn(),
    refreshToolbar: vi.fn(),
  };
  const selection = pipelineWorkingCopy.materializeSelection(collectionFilename ? pipeline.getCollectionByFilename(collectionFilename) : null)!;
  const sequence = selection.materialization.kind === 'loaded' ? selection.materialization.sequence : null;
  collectionView.applySelection(sequence!, { collection: selection.selection instanceof Collection ? selection.selection : null });
  const openFolder = new AppSessionState();
  openFolder.setCurrentFolderAccess({ folderPath: 'C:/clips' });
  const sourceMovies = { readCreatedClip: vi.fn(async (_clip: Clip) => undefined) };
  const zoom = { openClip: vi.fn((_clip: Clip) => true) };
  const insertion = new CreatedClipInsertion({ pipelineWorkingCopy, openFolder, grid, collectionView, sourceMovies, zoom });
  const clip = (name: string) => pipelineWorkingCopy.currentClipSequence!.orderedClips().find(candidate => candidate.name === name)!;
  return { insertion, pipelineWorkingCopy, pipeline, grid, sourceMovies, zoom, clip };
}

describe('CreatedClipInsertion', () => {
  it('in a saved collection’s view places the clip right after its original and leaves the view unsaved', () => {
    const { insertion, pipelineWorkingCopy, grid, clip } = insertionIn('picks.txt');

    insertion.insert(clip('bravo.mp4'), clipSource('bravo-refined.mp4'));

    expect(grid.shown).toEqual(['charlie.mp4', 'bravo.mp4', 'bravo-refined.mp4', 'alpha.mp4']);
    expect(pipelineWorkingCopy.hasDirtyClipSequenceChanges).toBe(true);
  });

  it('in a saved collection’s view also adds the clip to the folder’s full list', () => {
    const { insertion, pipeline, clip } = insertionIn('picks.txt');

    insertion.insert(clip('bravo.mp4'), clipSource('bravo-refined.mp4'));

    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'bravo-refined.mp4', 'bravo.mp4', 'charlie.mp4']);
  });

  it('in the folder’s full list places the clip where its name sorts, leaving the list saved', () => {
    const { insertion, pipelineWorkingCopy, grid, clip } = insertionIn(null);

    insertion.insert(clip('alpha.mp4'), clipSource('bravo-2.mp4'));

    expect(grid.shown).toEqual(['alpha.mp4', 'bravo-2.mp4', 'bravo.mp4', 'charlie.mp4']);
    expect(pipelineWorkingCopy.hasDirtyClipSequenceChanges).toBe(false);
  });

  it('selects the new clip, reads its source movie and opens it in Zoom', () => {
    const { insertion, grid, sourceMovies, zoom, clip } = insertionIn('picks.txt');

    const created = insertion.insert(clip('bravo.mp4'), clipSource('bravo-refined.mp4'));

    expect(created?.name).toBe('bravo-refined.mp4');
    expect(grid.selectedClipId).toBe(created?.id);
    expect(sourceMovies.readCreatedClip.mock.calls).toEqual([[created]]);
    expect(zoom.openClip.mock.calls).toEqual([[created]]);
  });

  it('answers null and opens nothing when the original is no longer in the view', () => {
    const { insertion, zoom } = insertionIn('picks.txt');
    const elsewhere = new Clip({ id: 'clip_99', source: clipSource('delta.mp4') });

    expect(insertion.insert(elsewhere, clipSource('delta-refined.mp4'))).toBeNull();
    expect(zoom.openClip).not.toHaveBeenCalled();
  });
});
