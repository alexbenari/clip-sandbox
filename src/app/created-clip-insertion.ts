import type { Clip } from '../domain/clip.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { AppSessionState } from './app-session-state.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export interface ICreatedClipGrid {
  setSelectedClipId(clipId: string): void;
  invalidateView(cacheKey: string): void;
  renderCollection(sequence: ClipSequence, options: { cacheKey: string }): void;
}

export interface ICreatedClipSourceMovie {
  readClip(clip: Clip): Promise<void>;
}

export interface ICreatedClipZoom {
  openClip(clip: Clip): boolean;
}

type CreatedClipInsertionDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'isPipelineMode' | 'insertCreatedClipInPipeline' | 'insertCreatedClipAfter'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  grid: ICreatedClipGrid;
  collectionView: Pick<CollectionViewWorkflow, 'applySelection' | 'activeCacheKey' | 'refreshSelector' | 'refreshToolbar'>;
  sourceMovies: ICreatedClipSourceMovie;
  zoom: ICreatedClipZoom;
}>;

export class CreatedClipInsertion {
  constructor(private readonly deps: CreatedClipInsertionDependencies) {}

  insert(originalClip: Clip, createdSource: ClipSource): Clip | null {
    const { pipelineWorkingCopy, collectionView, sourceMovies, zoom } = this.deps;
    const createdClip = pipelineWorkingCopy.isPipelineMode()
      ? this.insertIntoPipelineView(createdSource)
      : this.insertIntoCollectionView(originalClip, createdSource);
    collectionView.refreshToolbar();
    if (!createdClip) return null;
    void sourceMovies.readClip(createdClip);
    zoom.openClip(createdClip);
    return createdClip;
  }

  private insertIntoPipelineView(createdSource: ClipSource): Clip | null {
    const { pipelineWorkingCopy, grid, collectionView, openFolder } = this.deps;
    const result = pipelineWorkingCopy.insertCreatedClipInPipeline(createdSource);
    if (!result.ok) return null;
    grid.invalidateView('pipeline');
    collectionView.applySelection(result.sequence, { collection: null, folderAccess: openFolder.currentFolderAccess });
    grid.setSelectedClipId(result.clip.id);
    return result.clip;
  }

  private insertIntoCollectionView(originalClip: Clip, createdSource: ClipSource): Clip | null {
    const { pipelineWorkingCopy, grid, collectionView } = this.deps;
    const result = pipelineWorkingCopy.insertCreatedClipAfter(originalClip.id, createdSource);
    if (!result.ok) return null;
    grid.invalidateView('pipeline');
    grid.invalidateView(collectionView.activeCacheKey());
    grid.renderCollection(result.sequence, { cacheKey: collectionView.activeCacheKey() });
    collectionView.refreshSelector();
    collectionView.refreshToolbar();
    grid.setSelectedClipId(result.clip.id);
    return result.clip;
  }
}
