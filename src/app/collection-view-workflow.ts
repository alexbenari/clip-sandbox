import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { FolderAccess } from './folder-access.js';
import type { IEventSource } from './event-source.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export interface ICollectionGridEvents {
  cardCountChanged: void;
  selectionChanged: unknown;
  orderChanged: string[];
  removeSelectedRequested: string[];
}

export interface ICollectionGridView extends IEventSource<ICollectionGridEvents> {
  renderCollection(sequence: ClipSequence | null, options: { cacheKey: string }): void;
  invalidateView(cacheKey: string): void;
  getCardCount(): number;
  getSelectedClipIds(): string[];
  areTitlesHidden(): boolean;
  setTitlesHidden(hidden: boolean): void;
  clear(): void;
}

export interface ICollectionToolbarView extends IEventSource<{ toggleTitlesRequested: void }> {
  render(state: {
    clipCount: number;
    hasPipeline: boolean;
    hasSequence: boolean;
    hasSelection: boolean;
    isPipelineMode: boolean;
    titlesHidden: boolean;
    hasUnsavedChanges: boolean;
  }): void;
}

export interface ICollectionSelectorView {
  render(state: {
    pipeline: Pipeline | null;
    activeCollection: Collection | null;
    currentClipSequence: ClipSequence | null;
    hasUnsavedChanges: boolean;
  }): void;
}

export interface IZoomTitleView {
  setTitleHidden(hidden: boolean): void;
}

export interface ISelectionChangeSurfaces {
  readonly collectionConflict: { hide(): void };
  readonly contextMenu: { close(options: { restoreFocus: boolean }): void };
  readonly addToCollectionDialog: { close(): void };
  readonly zoom: { isOpen(): boolean };
}

type CollectionViewDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'activeCollection' | 'currentClipSequence' | 'isPipelineMode'
    | 'hasDirtyClipSequenceChanges' | 'activateSelection' | 'replaceCurrentOrder' | 'removeFromCurrentSequence' | 'reset'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess' | 'setCurrentFolderAccess'>;
  grid: ICollectionGridView;
  toolbar: ICollectionToolbarView;
  selector: ICollectionSelectorView;
  zoomTitle: IZoomTitleView;
  surfaces: ISelectionChangeSurfaces;
  reporter: Pick<ActivityReporter, 'success'>;
  appText: Pick<AppText, 'removedClipsText'>;
}>;

export class CollectionViewWorkflow {
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly view: CollectionViewDependencies) {
    this.unsubscribes = [
      view.grid.on('cardCountChanged', () => this.refreshToolbar()),
      view.grid.on('selectionChanged', () => this.refreshToolbar()),
      view.grid.on('orderChanged', orderedClipIds => this.applyOrder(orderedClipIds)),
      view.grid.on('removeSelectedRequested', orderedClipIds => this.removeFromCollectionView(orderedClipIds)),
      view.toolbar.on('toggleTitlesRequested', () => this.toggleTitles()),
    ];
  }

  cacheKeyFor(collection: Collection | null): string {
    return collection?.filename ? `collection:${collection.filename}` : 'pipeline';
  }

  activeCacheKey(): string {
    return this.cacheKeyFor(this.view.pipelineWorkingCopy.activeCollection);
  }

  refreshSelector(): void {
    const { pipelineWorkingCopy } = this.view;
    this.view.selector.render({
      pipeline: pipelineWorkingCopy.pipeline,
      activeCollection: pipelineWorkingCopy.activeCollection,
      currentClipSequence: pipelineWorkingCopy.currentClipSequence,
      hasUnsavedChanges: pipelineWorkingCopy.hasDirtyClipSequenceChanges,
    });
  }

  refreshToolbar(): void {
    const { pipelineWorkingCopy, grid } = this.view;
    this.view.toolbar.render({
      clipCount: grid.getCardCount(),
      hasPipeline: !!pipelineWorkingCopy.pipeline,
      hasSequence: !!pipelineWorkingCopy.currentClipSequence,
      hasSelection: grid.getSelectedClipIds().length > 0,
      isPipelineMode: pipelineWorkingCopy.isPipelineMode(),
      titlesHidden: grid.areTitlesHidden(),
      hasUnsavedChanges: pipelineWorkingCopy.hasDirtyClipSequenceChanges,
    });
  }

  applySelection(clipSequence: ClipSequence, {
    collection = this.view.pipelineWorkingCopy.activeCollection,
    folderAccess = this.view.openFolder.currentFolderAccess,
    statusText = '',
    timeout = 2500,
  }: {
    collection?: Collection | null;
    folderAccess?: FolderAccess | null;
    statusText?: string;
    timeout?: number;
  } = {}): void {
    const { surfaces } = this.view;
    surfaces.collectionConflict.hide();
    surfaces.contextMenu.close({ restoreFocus: false });
    surfaces.addToCollectionDialog.close();
    this.view.openFolder.setCurrentFolderAccess(folderAccess || null);
    this.view.pipelineWorkingCopy.activateSelection({ collection, sequence: clipSequence });
    this.view.grid.renderCollection(clipSequence, { cacheKey: this.cacheKeyFor(collection) });
    this.refreshSelector();
    this.refreshToolbar();
    if (statusText) this.view.reporter.success(statusText, timeout);
  }

  renderActiveSequence(): void {
    this.view.grid.renderCollection(this.view.pipelineWorkingCopy.currentClipSequence, { cacheKey: this.activeCacheKey() });
  }

  // Clearing the grid shows its titles again.
  clearLoadedView(): void {
    this.view.grid.clear();
    this.view.zoomTitle.setTitleHidden(this.view.grid.areTitlesHidden());
    this.view.pipelineWorkingCopy.reset();
    this.view.openFolder.setCurrentFolderAccess(null);
    this.refreshSelector();
    this.refreshToolbar();
  }

  setTitlesHidden(hidden: boolean): void {
    this.view.grid.setTitlesHidden(hidden);
    this.view.zoomTitle.setTitleHidden(hidden);
    this.refreshToolbar();
  }

  toggleTitles(): void {
    this.setTitlesHidden(!this.view.grid.areTitlesHidden());
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private applyOrder(orderedClipIds: string[]): void {
    if (!this.view.pipelineWorkingCopy.currentClipSequence) return;
    this.view.pipelineWorkingCopy.replaceCurrentOrder(orderedClipIds);
    this.refreshSelector();
    this.refreshToolbar();
  }

  // Removing from the pipeline view moves files to the Recycle Bin instead, which TrashClipsWorkflow handles.
  private removeFromCollectionView(orderedClipIds: string[]): void {
    const { pipelineWorkingCopy, grid } = this.view;
    if (this.view.surfaces.zoom.isOpen() || !pipelineWorkingCopy.currentClipSequence || pipelineWorkingCopy.isPipelineMode()) return;
    const removedClipIds = pipelineWorkingCopy.removeFromCurrentSequence(orderedClipIds);
    if (removedClipIds.length === 0) return;
    grid.invalidateView(this.activeCacheKey());
    grid.renderCollection(pipelineWorkingCopy.currentClipSequence, { cacheKey: this.activeCacheKey() });
    this.refreshSelector();
    this.refreshToolbar();
    this.view.reporter.success(this.view.appText.removedClipsText(removedClipIds.length));
  }
}
