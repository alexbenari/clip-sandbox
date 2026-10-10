import { describe, expect, it, vi } from 'vitest';

import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import { CollectionViewWorkflow, type ICollectionGridEvents } from '../../src/app/collection-view-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineSession } from '../../src/app/pipeline-session.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

class FakeGrid extends EventSource<ICollectionGridEvents> {
  renders: { names: string[]; cacheKey: string }[] = [];
  invalidated: string[] = [];
  selectedClipIds: string[] = [];
  titlesHidden = false;
  cleared = false;
  renderCollection(sequence: { clipNamesInOrder(): string[] } | null, { cacheKey }: { cacheKey: string }) {
    this.renders.push({ names: sequence?.clipNamesInOrder() ?? [], cacheKey });
  }
  invalidateView(cacheKey: string) { this.invalidated.push(cacheKey); }
  getCardCount() { return this.renders.at(-1)?.names.length ?? 0; }
  getSelectedClipIds() { return this.selectedClipIds; }
  areTitlesHidden() { return this.titlesHidden; }
  setTitlesHidden(hidden: boolean) { this.titlesHidden = hidden; }
  clear() { this.cleared = true; }
}

class FakeToolbar extends EventSource<{ toggleTitlesRequested: void }> {
  render = vi.fn();
}

function collectionView() {
  const pipeline = new Pipeline({
    folderName: 'clips',
    videoFiles: [new File(['a'], 'alpha.mp4'), new File(['b'], 'bravo.mp4')],
    collections: [Collection.fromFilename({ filename: 'subset.txt', orderedClipNames: ['bravo.mp4', 'alpha.mp4'] })],
  });
  const pipelineSession = new PipelineSession();
  pipelineSession.loadPipeline(pipeline);
  const openFolder = new AppSessionState();
  const grid = new FakeGrid();
  const toolbar = new FakeToolbar();
  const selector = { render: vi.fn() };
  const surfaces = {
    collectionConflict: { hide: vi.fn() },
    contextMenu: { close: vi.fn() },
    addToCollectionDialog: { close: vi.fn() },
    zoom: { isOpen: vi.fn(() => false) },
  };
  const reporter = { success: vi.fn() };
  const workflow = new CollectionViewWorkflow({
    pipelineSession, openFolder, grid, toolbar, selector, surfaces, reporter, appText: new AppText(),
  });
  const showSubset = () => {
    const subset = pipeline.getCollectionByFilename('subset.txt');
    const loaded = pipelineSession.materializeSelection(subset);
    if (!loaded || loaded.materialization.kind !== 'loaded') throw new Error('subset did not load');
    workflow.applySelection(loaded.materialization.sequence, { collection: subset });
  };
  return { workflow, pipelineSession, openFolder, grid, toolbar, selector, surfaces, reporter, showSubset };
}

describe('CollectionViewWorkflow', () => {
  it('names grid views by collection file, and the pipeline view as "pipeline"', () => {
    const { workflow } = collectionView();

    expect(workflow.cacheKeyFor(Collection.fromFilename({ filename: 'subset.txt' }))).toBe('collection:subset.txt');
    expect(workflow.cacheKeyFor(null)).toBe('pipeline');
    expect(workflow.activeCacheKey()).toBe('pipeline');
  });

  it('applies a collection selection: closes transient surfaces, renders it, and reports the status', () => {
    const { workflow, pipelineSession, grid, selector, surfaces, reporter, openFolder } = collectionView();
    const subset = pipelineSession.pipeline!.getCollectionByFilename('subset.txt');
    const loaded = pipelineSession.materializeSelection(subset);
    if (!loaded || loaded.materialization.kind !== 'loaded') throw new Error('subset did not load');
    const folderSession = { folderPath: 'C:/clips' };

    workflow.applySelection(loaded.materialization.sequence, { collection: subset, folderSession, statusText: 'Loaded subset.' });

    expect(surfaces.collectionConflict.hide).toHaveBeenCalledOnce();
    expect(surfaces.contextMenu.close).toHaveBeenCalledWith({ restoreFocus: false });
    expect(surfaces.addToCollectionDialog.close).toHaveBeenCalledOnce();
    expect(openFolder.currentFolderSession).toBe(folderSession);
    expect(pipelineSession.activeCollection).toBe(subset);
    expect(grid.renders.at(-1)).toEqual({ names: ['bravo.mp4', 'alpha.mp4'], cacheKey: 'collection:subset.txt' });
    expect(selector.render).toHaveBeenLastCalledWith(expect.objectContaining({ activeCollection: subset }));
    expect(reporter.success).toHaveBeenCalledWith('Loaded subset.', 2500);
  });

  it('refreshes the toolbar from the grid when cards or the selection change', () => {
    const { grid, toolbar, showSubset } = collectionView();
    showSubset();
    grid.selectedClipIds = ['clip_1'];

    grid.emit('selectionChanged', null);

    expect(toolbar.render).toHaveBeenLastCalledWith({
      clipCount: 2, hasPipeline: true, hasSequence: true, hasSelection: true, isPipelineMode: false, titlesHidden: false,
    });
    toolbar.render.mockClear();
    grid.emit('cardCountChanged');
    expect(toolbar.render).toHaveBeenCalledOnce();
  });

  it('applies a reordering to the working sequence', () => {
    const { grid, pipelineSession, selector, showSubset } = collectionView();
    showSubset();
    const ids = pipelineSession.currentClipSequence!.orderedClips().map(clip => clip.id);

    grid.emit('orderChanged', [...ids].reverse());

    expect(pipelineSession.currentClipSequence!.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(pipelineSession.hasDirtyClipSequenceChanges).toBe(true);
    expect(selector.render).toHaveBeenCalled();
  });

  it('removes selected clips from a collection view and reports how many', () => {
    const { grid, pipelineSession, reporter, showSubset } = collectionView();
    showSubset();
    const [bravo] = pipelineSession.currentClipSequence!.orderedClips();

    grid.emit('removeSelectedRequested', [bravo.id]);

    expect(pipelineSession.currentClipSequence!.clipNamesInOrder()).toEqual(['alpha.mp4']);
    expect(grid.invalidated).toEqual(['collection:subset.txt']);
    expect(grid.renders.at(-1)).toEqual({ names: ['alpha.mp4'], cacheKey: 'collection:subset.txt' });
    expect(reporter.success).toHaveBeenCalledWith(new AppText().removedClipsText(1));
  });

  it('leaves removal in the pipeline view, and removal while Zoom is open, to other flows', () => {
    const { grid, pipelineSession, surfaces, showSubset } = collectionView();
    const [alpha] = pipelineSession.currentClipSequence!.orderedClips();

    grid.emit('removeSelectedRequested', [alpha.id]);
    expect(pipelineSession.currentClipSequence!.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.mp4']);

    showSubset();
    surfaces.zoom.isOpen.mockReturnValue(true);
    grid.emit('removeSelectedRequested', [alpha.id]);
    expect(pipelineSession.currentClipSequence!.clipNamesInOrder()).toEqual(['bravo.mp4', 'alpha.mp4']);
  });

  it('toggles clip titles from the toolbar', () => {
    const { grid, toolbar } = collectionView();

    toolbar.emit('toggleTitlesRequested');

    expect(grid.titlesHidden).toBe(true);
    expect(toolbar.render).toHaveBeenLastCalledWith(expect.objectContaining({ titlesHidden: true }));
  });

  it('clears the loaded folder from the view', () => {
    const { workflow, grid, pipelineSession, openFolder, toolbar } = collectionView();
    openFolder.setCurrentFolderSession({ folderPath: 'C:/clips' });

    workflow.clearLoadedView();

    expect(grid.cleared).toBe(true);
    expect(pipelineSession.pipeline).toBeNull();
    expect(openFolder.currentFolderSession).toBeNull();
    expect(toolbar.render).toHaveBeenLastCalledWith(expect.objectContaining({ hasPipeline: false, hasSequence: false }));
  });

  it('stops reacting to the grid and toolbar once disposed', () => {
    const { workflow, grid, toolbar } = collectionView();

    workflow.dispose();

    expect(grid.subscriberCount('orderChanged')).toBe(0);
    expect(toolbar.subscriberCount('toggleTitlesRequested')).toBe(0);
  });
});
