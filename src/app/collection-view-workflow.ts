import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { IEventSource } from './event-source.js';
import type { PipelineSession } from './pipeline-session.js';

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
  destroy(): void;
}

export interface ICollectionToolbarView extends IEventSource<{ toggleTitlesRequested: void }> {
  render(state: {
    clipCount: number;
    hasPipeline: boolean;
    hasSequence: boolean;
    hasSelection: boolean;
    isPipelineMode: boolean;
    titlesHidden: boolean;
  }): void;
}

export interface ICollectionSelectorView {
  render(state: { pipeline: Pipeline | null; activeCollection: Collection | null; currentClipSequence: ClipSequence | null }): void;
}

export interface ISelectionChangeSurfaces {
  readonly collectionConflict: { hide(): void };
  readonly contextMenu: { close(options: { restoreFocus: boolean }): void };
  readonly addToCollectionDialog: { close(): void };
  readonly zoom: { isOpen(): boolean };
}

type CollectionViewDependencies = Readonly<{
  pipelineSession: Pick<PipelineSession, 'pipeline' | 'activeCollection' | 'currentClipSequence' | 'isPipelineMode'
    | 'activateSelection' | 'replaceCurrentOrder' | 'removeFromCurrentSequence' | 'reset'>;
  openFolder: Pick<AppSessionState, 'currentFolderSession' | 'setCurrentFolderSession'>;
  grid: ICollectionGridView;
  toolbar: ICollectionToolbarView;
  selector: ICollectionSelectorView;
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
    return this.cacheKeyFor(this.view.pipelineSession.activeCollection);
  }

  refreshSelector(): void {
    const { pipelineSession } = this.view;
    this.view.selector.render({
      pipeline: pipelineSession.pipeline,
      activeCollection: pipelineSession.activeCollection,
      currentClipSequence: pipelineSession.currentClipSequence,
    });
  }

  refreshToolbar(): void {
    const { pipelineSession, grid } = this.view;
    this.view.toolbar.render({
      clipCount: grid.getCardCount(),
      hasPipeline: !!pipelineSession.pipeline,
      hasSequence: !!pipelineSession.currentClipSequence,
      hasSelection: grid.getSelectedClipIds().length > 0,
      isPipelineMode: pipelineSession.isPipelineMode(),
      titlesHidden: grid.areTitlesHidden(),
    });
  }

  applySelection(clipSequence: ClipSequence, {
    collection = this.view.pipelineSession.activeCollection,
    folderSession = this.view.openFolder.currentFolderSession,
    statusText = '',
    timeout = 2500,
  }: {
    collection?: Collection | null;
    folderSession?: unknown;
    statusText?: string;
    timeout?: number;
  } = {}): void {
    const { surfaces } = this.view;
    surfaces.collectionConflict.hide();
    surfaces.contextMenu.close({ restoreFocus: false });
    surfaces.addToCollectionDialog.close();
    this.view.openFolder.setCurrentFolderSession(folderSession || null);
    this.view.pipelineSession.activateSelection({ collection, sequence: clipSequence });
    this.view.grid.renderCollection(clipSequence, { cacheKey: this.cacheKeyFor(collection) });
    this.refreshSelector();
    this.refreshToolbar();
    if (statusText) this.view.reporter.success(statusText, timeout);
  }

  renderActiveSequence(): void {
    this.view.grid.renderCollection(this.view.pipelineSession.currentClipSequence, { cacheKey: this.activeCacheKey() });
  }

  clearLoadedView(): void {
    this.view.grid.destroy();
    this.view.pipelineSession.reset();
    this.view.openFolder.setCurrentFolderSession(null);
    this.refreshSelector();
    this.refreshToolbar();
  }

  setTitlesHidden(hidden: boolean): void {
    this.view.grid.setTitlesHidden(hidden);
    this.refreshToolbar();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private toggleTitles(): void {
    this.setTitlesHidden(!this.view.grid.areTitlesHidden());
  }

  private applyOrder(orderedClipIds: string[]): void {
    if (!this.view.pipelineSession.currentClipSequence) return;
    this.view.pipelineSession.replaceCurrentOrder(orderedClipIds);
    this.refreshSelector();
    this.refreshToolbar();
  }

  // Removing from the pipeline view deletes files instead, which the delete flow handles.
  private removeFromCollectionView(orderedClipIds: string[]): void {
    const { pipelineSession, grid } = this.view;
    if (this.view.surfaces.zoom.isOpen() || !pipelineSession.currentClipSequence || pipelineSession.isPipelineMode()) return;
    const removedClipIds = pipelineSession.removeFromCurrentSequence(orderedClipIds);
    if (removedClipIds.length === 0) return;
    grid.invalidateView(this.activeCacheKey());
    grid.renderCollection(pipelineSession.currentClipSequence, { cacheKey: this.activeCacheKey() });
    this.refreshSelector();
    this.refreshToolbar();
    this.view.reporter.success(this.view.appText.removedClipsText(removedClipIds.length));
  }
}
