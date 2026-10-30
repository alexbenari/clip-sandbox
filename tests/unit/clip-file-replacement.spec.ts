import { describe, expect, it, vi } from 'vitest';

import { ClipFileReplacement } from '../../src/app/clip-file-replacement.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Clip } from '../../src/domain/clip.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

// The grid keeps each view it built; a cached view keeps showing the addresses it was built with.
class FakeGrid {
  readonly cached = new Map<string, string[]>();
  selectedClipId: string | null = null;
  invalidateAllViews() { this.cached.clear(); }
  setSelectedClipId(clipId: string) { this.selectedClipId = clipId; }
  show(cacheKey: string, clips: readonly Clip[]) {
    if (!this.cached.has(cacheKey)) this.cached.set(cacheKey, clips.map(clip => clip.mediaSource));
    return this.cached.get(cacheKey);
  }
}

function replacementIn({ failingCollection = null }: { failingCollection?: string | null } = {}) {
  const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['bravo.webm', 'alpha.mp4'] });
  const others = Collection.fromFilename({ filename: 'others.txt', orderedClipNames: ['bravo.webm'] });
  const pipeline = new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4'), clipSource('bravo.webm')], collections: [picks, others] });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const grid = new FakeGrid();
  const showActive = () => grid.show('pipeline', pipelineWorkingCopy.currentClipSequence!.orderedClips());
  showActive();
  const written: Record<string, string[]> = {};
  const fileWriter = {
    write: vi.fn(async (collection: Collection) => {
      if (collection.filename === failingCollection) throw new Error('EBUSY: resource busy or locked');
      written[collection.filename!] = collection.orderedClipNames;
      return { mode: 'saved' };
    }),
  };
  const collectionView = { renderActiveSequence: () => { showActive(); }, refreshSelector: vi.fn(), refreshToolbar: vi.fn() };
  const sourceMovies = { readClip: vi.fn(async (_clip: Clip) => undefined) };
  const zoom = { openClip: vi.fn((_clip: Clip) => true) };
  const replacement = new ClipFileReplacement({ pipelineWorkingCopy, fileWriter, grid, collectionView, sourceMovies, zoom });
  const clip = (name: string) => pipelineWorkingCopy.currentClipSequence!.orderedClips().find(candidate => candidate.name === name)!;
  return { replacement, pipeline, grid, written, sourceMovies, zoom, clip };
}

describe('ClipFileReplacement', () => {
  it('shows the new file’s address in the view, rebuilding the view it had cached', async () => {
    const { replacement, grid, clip } = replacementIn();

    await replacement.replace(clip('alpha.mp4'), clipSource('alpha.mp4', { mediaSource: 'file:///clips/alpha.mp4?modified=2' }));

    expect(grid.cached.get('pipeline')).toEqual(['file:///clips/alpha.mp4?modified=2', 'file:///clips/bravo.webm']);
  });

  it('rewrites every collection that lists a clip saved under a new name', async () => {
    const { replacement, written, clip } = replacementIn();

    await replacement.replace(clip('bravo.webm'), clipSource('bravo.mp4'));

    expect(written).toEqual({ 'others.txt': ['bravo.mp4'], 'picks.txt': ['bravo.mp4', 'alpha.mp4'] });
  });

  it('answers the collections it could not rewrite, which keep the old name', async () => {
    const { replacement, pipeline, clip } = replacementIn({ failingCollection: 'picks.txt' });

    const result = await replacement.replace(clip('bravo.webm'), clipSource('bravo.mp4'));

    expect(result?.failedCollections.map(({ filename, error }) => [filename, (error as Error).message]))
      .toEqual([['picks.txt', 'EBUSY: resource busy or locked']]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.webm', 'alpha.mp4']);
  });

  it('selects the clip, reads its source movie again and opens it in Zoom', async () => {
    const { replacement, grid, sourceMovies, zoom, clip } = replacementIn();
    const alpha = clip('alpha.mp4');

    await replacement.replace(alpha, clipSource('alpha.mp4'));

    expect(grid.selectedClipId).toBe(alpha.id);
    expect(sourceMovies.readClip.mock.calls).toEqual([[alpha]]);
    expect(zoom.openClip.mock.calls).toEqual([[alpha]]);
  });

  it('answers null and opens nothing for a clip the open folder does not hold', async () => {
    const { replacement, zoom } = replacementIn();
    const stranger = new Clip({ id: 'clip_99', source: clipSource('alpha.mp4') });

    expect(await replacement.replace(stranger, clipSource('alpha.mp4'))).toBeNull();
    expect(zoom.openClip).not.toHaveBeenCalled();
  });
});
