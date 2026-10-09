import type { ClipFile } from '../domain/clip.js';
import { Collection } from '../domain/collection.js';
import type { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { PipelineFactory } from '../business-logic/PipelineFactory.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { CollectionSaveWorkflow } from './collection-save-workflow.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { IPipelineCatalogEntry } from './pipeline-catalog.js';
import type { PipelineSession } from './pipeline-session.js';

export type PendingSelectionAction =
  | Readonly<{ type: 'browse-folder' }>
  | Readonly<{ type: 'open-catalog-pipeline'; pipeline: IPipelineCatalogEntry }>
  | Readonly<{ type: 'switch-selection'; collectionFilename: string | null }>;

type FolderContents = { folderSession: unknown; files: ClipFile[]; folderName: string };

export interface IFolderSource {
  pickFolder(options: { onFileReadError?: (info: unknown, folderSession: unknown) => void }): Promise<FolderContents>;
  refreshFolder(folderSession: unknown): Promise<FolderContents>;
  openPipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<FolderContents>;
  canMutateDisk(folderSession: unknown): folderSession is { folderPath: string };
}

export interface IMissingClipsPrompt {
  showConflict(
    conflict: { existingNamesInOrder: string[]; missingCount: number; missingNames: string[] },
    handlers: { onApply: () => void; onCancel: () => void },
  ): void;
  hide(): void;
}

export interface IUnsavedChangesPrompt {
  open(request: { message: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }): void;
  close(): void;
}

export interface ILoadStatusView {
  showInitialLoadStatus(status: { pipeline: Pipeline; clipCount: number }): void;
  showSelectionLoadStatus(status: { isPipelineMode: boolean; clipCount: number }): void;
}

type FolderSelectionDependencies = Readonly<{
  pipelineSession: Pick<PipelineSession, 'pipeline' | 'activeCollection' | 'activeCollectionFilename'
    | 'hasDirtyClipSequenceChanges' | 'materializeSelection' | 'loadPipeline'>;
  openFolder: Pick<AppSessionState, 'currentFolderSession'>;
  folders: IFolderSource;
  pipelineFactory: Pick<PipelineFactory, 'buildPipeline'>;
  collectionFileValidator: Pick<CollectionDescriptionValidator, 'parseFile'>;
  diagnostics: Pick<AppDiagnostics, 'logInvalidDescription' | 'logRuntimeError' | 'logDirectoryReadError'>;
  grid: { invalidateView(cacheKey: string): void; invalidateAllViews(): void; retagActiveView(cacheKey: string | null): void };
  collectionView: Pick<CollectionViewWorkflow, 'applySelection' | 'refreshSelector' | 'cacheKeyFor' | 'activeCacheKey'>;
  missingClipsPrompt: IMissingClipsPrompt;
  unsavedChangesPrompt: IUnsavedChangesPrompt;
  loadStatus: ILoadStatusView;
  collectionSave: Pick<CollectionSaveWorkflow, 'saveActive'>;
  screens: { showCollectionScreen(): void };
  settingsLoaded: () => Promise<unknown>;
  toolbar: IEventSource<{ browseRequested: void }>;
  selector: IEventSource<{ selectionRequested: string | null }>;
  catalog: IEventSource<{ loadRequested: IPipelineCatalogEntry }> | null;
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'collectionReadErrorText' | 'noCollectionMatchesText' | 'collectionPartiallyLoadedText'>;
}>;

export class FolderSelectionWorkflow {
  private pendingAction: PendingSelectionAction | null = null;
  private selectionRevision = 0;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly folder: FolderSelectionDependencies) {
    this.unsubscribes = [
      folder.toolbar.on('browseRequested', () => { void this.browseForFolder(); }),
      folder.selector.on('selectionRequested', collectionFilename => this.requestSelection(collectionFilename)),
      ...(folder.catalog ? [folder.catalog.on('loadRequested', entry => { void this.openCatalogPipeline(entry); })] : []),
    ];
  }

  get pendingSelectionAction(): PendingSelectionAction | null {
    return this.pendingAction;
  }

  async browseForFolder(): Promise<void> {
    if (this.folder.pipelineSession.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'browse-folder' });
      return;
    }
    await this.pickFolder();
  }

  async openCatalogPipeline(entry: IPipelineCatalogEntry): Promise<void> {
    if (this.folder.pipelineSession.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'open-catalog-pipeline', pipeline: entry });
      return;
    }
    await this.loadCatalogPipeline(entry);
  }

  requestSelection(collectionFilename: string | null): void {
    const { pipelineSession, collectionView } = this.folder;
    if (!pipelineSession.pipeline || (collectionFilename || '') === pipelineSession.activeCollectionFilename()) {
      collectionView.refreshSelector();
      return;
    }
    if (pipelineSession.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'switch-selection', collectionFilename });
      return;
    }
    void this.switchSelectionFromDisk(collectionFilename);
  }

  async refreshActiveFolder(): Promise<void> {
    const { openFolder, folders, pipelineSession } = this.folder;
    const folderSession = openFolder.currentFolderSession;
    if (!folders.canMutateDisk(folderSession)) return;
    const activeCollectionFilename = pipelineSession.activeCollectionFilename();
    const selection = await folders.refreshFolder(folderSession);
    if (openFolder.currentFolderSession !== folderSession || pipelineSession.hasDirtyClipSequenceChanges) return;
    await this.loadPipeline({ ...selection, preserveCollectionFilename: activeCollectionFilename, reportInitialLoad: false });
  }

  async reloadSelection({
    pipeline = this.folder.pipelineSession.pipeline,
    collection = this.folder.pipelineSession.activeCollection,
    folderSession = this.folder.openFolder.currentFolderSession,
  }: {
    pipeline?: Pipeline | null;
    collection?: Collection | null;
    folderSession?: unknown;
  } = {}): Promise<void> {
    const { pipelineSession, collectionView, appText } = this.folder;
    if (!pipeline) return;
    const loaded = pipelineSession.materializeSelection(collection);
    if (!loaded) return;
    const { selection, materialization: result } = loaded;
    if (result.kind === 'has-missing') {
      this.folder.missingClipsPrompt.showConflict(result, {
        onApply: () => {
          if (result.existingNamesInOrder.length === 0) {
            collectionView.refreshSelector();
            this.folder.reporter.success(appText.noCollectionMatchesText(result.missingCount), 4500);
            return;
          }
          this.folder.grid.invalidateView(collectionView.cacheKeyFor(collection));
          collectionView.applySelection(result.partialSequence, {
            collection,
            folderSession,
            statusText: appText.collectionPartiallyLoadedText(result.existingNamesInOrder.length, result.missingCount),
            timeout: 4000,
          });
        },
        onCancel: () => {
          collectionView.refreshSelector();
        },
      });
      return;
    }
    collectionView.applySelection(result.sequence, {
      collection: selection instanceof Collection ? selection : null,
      folderSession,
    });
    this.folder.loadStatus.showSelectionLoadStatus({
      isPipelineMode: selection === pipeline,
      clipCount: result.sequence.orderedClips().length,
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private askAboutUnsavedChanges(action: PendingSelectionAction): void {
    this.pendingAction = action;
    this.folder.collectionView.refreshSelector();
    this.openUnsavedChangesPrompt();
  }

  private openUnsavedChangesPrompt(): void {
    this.folder.unsavedChangesPrompt.open({
      message: this.pendingAction?.type === 'browse-folder'
        ? 'The current view has unsaved changes. Save before browsing to another folder?'
        : 'The current view has unsaved changes. Save before switching views?',
      onSave: () => { void this.continuePendingAction({ saveFirst: true }); },
      onDiscard: () => { void this.continuePendingAction({ saveFirst: false }); },
      onCancel: () => {
        this.pendingAction = null;
        this.folder.collectionView.refreshSelector();
      },
    });
  }

  private async continuePendingAction({ saveFirst }: { saveFirst: boolean }): Promise<void> {
    const { collectionView, grid, unsavedChangesPrompt } = this.folder;
    const action = this.pendingAction;
    if (!action) {
      unsavedChangesPrompt.close();
      collectionView.refreshSelector();
      return;
    }
    if (saveFirst) {
      const outcome = await this.folder.collectionSave.saveActive();
      if (outcome === 'cancelled') {
        this.pendingAction = null;
        collectionView.refreshSelector();
        return;
      }
      if (outcome === 'failed') {
        this.openUnsavedChangesPrompt();
        return;
      }
    }
    unsavedChangesPrompt.close();
    this.pendingAction = null;
    if (action.type === 'browse-folder') {
      await this.pickFolder();
      return;
    }
    if (action.type === 'open-catalog-pipeline') {
      await this.loadCatalogPipeline(action.pipeline);
      return;
    }
    if (!saveFirst) {
      grid.invalidateView(collectionView.activeCacheKey());
      grid.retagActiveView(null);
      await this.reloadSelection({
        pipeline: this.folder.pipelineSession.pipeline,
        collection: this.folder.pipelineSession.activeCollection,
      });
    }
    await this.switchSelectionFromDisk(action.collectionFilename);
  }

  private async pickFolder(): Promise<void> {
    const { folders, diagnostics } = this.folder;
    this.folder.missingClipsPrompt.hide();
    try {
      const selection = await folders.pickFolder({
        onFileReadError: (info, folderSession) => {
          void diagnostics.logDirectoryReadError(info as Parameters<typeof diagnostics.logDirectoryReadError>[0], folderSession);
        },
      });
      await this.loadPipeline(selection);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await diagnostics.logRuntimeError('Failed to browse for a folder.', err, this.folder.openFolder.currentFolderSession);
      this.reportFolderReadFailure(err);
    }
  }

  private async loadCatalogPipeline(entry: IPipelineCatalogEntry): Promise<void> {
    try {
      const selection = await this.folder.folders.openPipelineCatalogEntry(entry);
      if (await this.loadPipeline(selection)) this.folder.screens.showCollectionScreen();
    } catch (err) {
      await this.folder.diagnostics.logRuntimeError(`Failed to open pipeline ${entry.name}.`, err, this.folder.openFolder.currentFolderSession);
      this.folder.reporter.failure(`Could not open ${entry.name}.`, {
        affected: 'Open pipeline',
        recovery: 'Check that the pipeline folder is still accessible, then refresh Pipelines.',
        technicalDetails: this.folder.reporter.technicalDetailsOf(err),
      });
    }
  }

  private async loadPipeline({
    folderSession = null,
    files = [],
    folderName = '',
    preserveCollectionFilename = '',
    reportInitialLoad = true,
  }: Partial<FolderContents> & { preserveCollectionFilename?: string; reportInitialLoad?: boolean }): Promise<boolean> {
    const { pipelineSession, grid, collectionView, diagnostics } = this.folder;
    await this.folder.settingsLoaded();
    try {
      const { pipeline } = await this.folder.pipelineFactory.buildPipeline({
        folderName,
        files,
        validator: this.folder.collectionFileValidator,
        logInvalidDescription: result => diagnostics.logInvalidDescription(result, folderSession),
      });
      const result = pipelineSession.loadPipeline(pipeline);
      if (!result) return false;
      grid.invalidateAllViews();
      grid.retagActiveView(null);
      const preservedCollection = preserveCollectionFilename ? pipeline.getCollectionByFilename(preserveCollectionFilename) : null;
      if (preservedCollection) {
        await this.reloadSelection({ pipeline, collection: preservedCollection, folderSession });
        return true;
      }
      collectionView.applySelection(result.sequence, { collection: null, folderSession });
      if (reportInitialLoad) {
        this.folder.loadStatus.showInitialLoadStatus({ pipeline, clipCount: result.sequence.orderedClips().length });
      }
      return true;
    } catch (err) {
      await diagnostics.logRuntimeError('Failed to load the selected folder.', err, folderSession);
      this.reportFolderReadFailure(err);
      return false;
    }
  }

  private async switchSelectionFromDisk(collectionFilename: string | null): Promise<void> {
    const { pipelineSession, openFolder, folders, diagnostics } = this.folder;
    const revision = ++this.selectionRevision;
    const folderSession = openFolder.currentFolderSession;
    const pipeline = pipelineSession.pipeline;
    if (!pipeline) return;
    if (!folders.canMutateDisk(folderSession)) {
      await this.reloadSelection({
        pipeline,
        collection: collectionFilename ? pipeline.getCollectionByFilename(collectionFilename) : null,
      });
      return;
    }
    const isStale = () => revision !== this.selectionRevision || openFolder.currentFolderSession !== folderSession
      || pipelineSession.pipeline !== pipeline || pipelineSession.hasDirtyClipSequenceChanges;
    try {
      const selection = await folders.refreshFolder(folderSession);
      if (isStale()) return;
      const refreshed = await this.folder.pipelineFactory.buildPipeline({
        folderName: selection.folderName,
        files: selection.files,
        validator: this.folder.collectionFileValidator,
        logInvalidDescription: result => diagnostics.logInvalidDescription(result, selection.folderSession),
      });
      if (isStale()) return;
      pipeline.setVideoFiles(refreshed.pipeline.videoFiles());
      pipeline.setCollections(refreshed.pipeline.collections());
      await this.reloadSelection({
        pipeline,
        collection: collectionFilename ? pipeline.getCollectionByFilename(collectionFilename) : null,
        folderSession: selection.folderSession,
      });
    } catch (error) {
      if (revision !== this.selectionRevision || openFolder.currentFolderSession !== folderSession) return;
      this.folder.reporter.failure('The folder could not be refreshed.', {
        affected: collectionFilename || 'Folder view',
        recovery: 'Check that the folder is accessible, then switch views again.',
        technicalDetails: this.folder.reporter.technicalDetailsOf(error),
      });
    }
  }

  private reportFolderReadFailure(err: unknown): void {
    this.folder.reporter.failure(this.folder.appText.collectionReadErrorText(err), {
      affected: 'Open folder',
      recovery: 'Check that the folder is accessible, then choose it again.',
      technicalDetails: this.folder.reporter.technicalDetailsOf(err),
    });
  }
}
