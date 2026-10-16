import { Collection } from '../domain/collection.js';
import type { CollectionTextFormat } from '../business-logic/collection-text-format.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { PipelineFactory } from '../business-logic/PipelineFactory.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { FolderAccess, FolderContents } from './folder-access.js';
import type { IScreenNavigation } from './collection-refinement-workflow.js';
import type { CollectionSaveWorkflow } from './collection-save-workflow.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import { LoadStatusText } from './load-status-text.js';
import type { IPipelineCatalogEntry } from './pipeline-catalog.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export type PendingSelectionAction =
  | Readonly<{ type: 'browse-folder' }>
  | Readonly<{ type: 'open-catalog-pipeline'; pipeline: IPipelineCatalogEntry }>
  | Readonly<{ type: 'switch-selection'; collectionFilename: string | null }>;

export interface IFolderSource {
  pickFolder(): Promise<FolderContents>;
  refreshFolder(folderAccess: FolderAccess): Promise<FolderContents>;
}

export interface IPipelineCatalogOpener {
  openPipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<FolderContents>;
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

type FolderSelectionDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'activeCollection' | 'activeCollectionFilename'
    | 'hasDirtyClipSequenceChanges' | 'materializeSelection' | 'loadPipeline'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  folders: IFolderSource;
  pipelineCatalog: IPipelineCatalogOpener;
  pipelineFactory: Pick<PipelineFactory, 'buildPipeline'>;
  collectionFormat: Pick<CollectionTextFormat, 'read'>;
  diagnostics: Pick<AppDiagnostics, 'logInvalidDescription' | 'logRuntimeError'>;
  grid: { invalidateView(cacheKey: string): void; invalidateAllViews(): void; retagActiveView(cacheKey: string | null): void };
  collectionView: Pick<CollectionViewWorkflow, 'applySelection' | 'refreshSelector' | 'cacheKeyFor' | 'activeCacheKey'>;
  missingClipsPrompt: IMissingClipsPrompt;
  unsavedChangesPrompt: IUnsavedChangesPrompt;
  collectionSave: Pick<CollectionSaveWorkflow, 'saveActive'>;
  navigation: Pick<IScreenNavigation, 'activate'>;
  collectionScreenId: string;
  settings: Readonly<{ whenLoaded(): Promise<void> }>;
  toolbar: IEventSource<{ browseRequested: void }>;
  selector: IEventSource<{ selectionRequested: string | null }>;
  catalog: IEventSource<{ loadRequested: IPipelineCatalogEntry }> | null;
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'collectionReadErrorText' | 'noCollectionMatchesText' | 'collectionPartiallyLoadedText'
    | 'collectionLoadedText' | 'loadedVideosText'>;
}>;

export class FolderSelectionWorkflow {
  private pendingAction: PendingSelectionAction | null = null;
  private selectionRevision = 0;
  private readonly unsubscribes: (() => void)[];
  private readonly loadStatusText: LoadStatusText;

  constructor(private readonly folder: FolderSelectionDependencies) {
    this.loadStatusText = new LoadStatusText(folder.appText);
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
    if (this.folder.pipelineWorkingCopy.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'browse-folder' });
      return;
    }
    await this.pickFolder();
  }

  async openCatalogPipeline(entry: IPipelineCatalogEntry): Promise<void> {
    if (this.folder.pipelineWorkingCopy.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'open-catalog-pipeline', pipeline: entry });
      return;
    }
    await this.loadCatalogPipeline(entry);
  }

  requestSelection(collectionFilename: string | null): void {
    const { pipelineWorkingCopy, collectionView } = this.folder;
    if (!pipelineWorkingCopy.pipeline || (collectionFilename || '') === pipelineWorkingCopy.activeCollectionFilename()) {
      collectionView.refreshSelector();
      return;
    }
    if (pipelineWorkingCopy.hasDirtyClipSequenceChanges) {
      this.askAboutUnsavedChanges({ type: 'switch-selection', collectionFilename });
      return;
    }
    void this.switchSelectionFromDisk(collectionFilename);
  }

  async refreshActiveFolder(): Promise<void> {
    const { openFolder, folders, pipelineWorkingCopy } = this.folder;
    const folderAccess = openFolder.currentFolderAccess;
    if (!folderAccess) return;
    const activeCollectionFilename = pipelineWorkingCopy.activeCollectionFilename();
    const selection = await folders.refreshFolder(folderAccess);
    if (openFolder.currentFolderAccess !== folderAccess || pipelineWorkingCopy.hasDirtyClipSequenceChanges) return;
    await this.loadPipeline({ ...selection, preserveCollectionFilename: activeCollectionFilename, reportInitialLoad: false });
  }

  async reloadSelection({
    pipeline = this.folder.pipelineWorkingCopy.pipeline,
    collection = this.folder.pipelineWorkingCopy.activeCollection,
    folderAccess = this.folder.openFolder.currentFolderAccess,
  }: {
    pipeline?: Pipeline | null;
    collection?: Collection | null;
    folderAccess?: FolderAccess | null;
  } = {}): Promise<void> {
    const { pipelineWorkingCopy, collectionView, appText } = this.folder;
    if (!pipeline) return;
    const loaded = pipelineWorkingCopy.materializeSelection(collection);
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
            folderAccess,
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
      folderAccess,
    });
    this.folder.reporter.success(this.loadStatusText.selectionLoaded(selection === pipeline, result.sequence.orderedClips().length));
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
      // A newer request asked about the unsaved changes while this save ran; that request decides now.
      if (this.pendingAction !== action) return;
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
        pipeline: this.folder.pipelineWorkingCopy.pipeline,
        collection: this.folder.pipelineWorkingCopy.activeCollection,
      });
    }
    await this.switchSelectionFromDisk(action.collectionFilename);
  }

  private async pickFolder(): Promise<void> {
    const { folders, diagnostics } = this.folder;
    this.folder.missingClipsPrompt.hide();
    try {
      const selection = await folders.pickFolder();
      await this.loadPipeline(selection);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await diagnostics.logRuntimeError('Failed to browse for a folder.', err, this.folder.openFolder.currentFolderAccess);
      this.reportFolderReadFailure(err);
    }
  }

  private async loadCatalogPipeline(entry: IPipelineCatalogEntry): Promise<void> {
    try {
      const selection = await this.folder.pipelineCatalog.openPipelineCatalogEntry(entry);
      if (await this.loadPipeline(selection)) this.folder.navigation.activate(this.folder.collectionScreenId);
    } catch (err) {
      await this.folder.diagnostics.logRuntimeError(`Failed to open pipeline ${entry.name}.`, err, this.folder.openFolder.currentFolderAccess);
      this.folder.reporter.failure(`Could not open ${entry.name}.`, {
        affected: 'Open pipeline',
        recovery: 'Check that the pipeline folder is still accessible, then refresh Pipelines.',
        technicalDetails: this.folder.reporter.technicalDetailsOf(err),
      });
    }
  }

  private async loadPipeline({
    folderAccess,
    files,
    folderName,
    preserveCollectionFilename = '',
    reportInitialLoad = true,
  }: FolderContents & { preserveCollectionFilename?: string; reportInitialLoad?: boolean }): Promise<boolean> {
    const { pipelineWorkingCopy, grid, collectionView, diagnostics } = this.folder;
    await this.folder.settings.whenLoaded();
    try {
      const { pipeline } = await this.folder.pipelineFactory.buildPipeline({
        folderName,
        files,
        collectionFormat: this.folder.collectionFormat,
        logInvalidDescription: result => diagnostics.logInvalidDescription(result, folderAccess),
      });
      const result = pipelineWorkingCopy.loadPipeline(pipeline);
      if (!result) return false;
      grid.invalidateAllViews();
      grid.retagActiveView(null);
      const preservedCollection = preserveCollectionFilename ? pipeline.getCollectionByFilename(preserveCollectionFilename) : null;
      if (preservedCollection) {
        await this.reloadSelection({ pipeline, collection: preservedCollection, folderAccess });
        return true;
      }
      collectionView.applySelection(result.sequence, { collection: null, folderAccess });
      if (reportInitialLoad) {
        this.folder.reporter.success(this.loadStatusText.folderLoaded(pipeline, result.sequence.orderedClips().length));
      }
      return true;
    } catch (err) {
      await diagnostics.logRuntimeError('Failed to load the selected folder.', err, folderAccess);
      this.reportFolderReadFailure(err);
      return false;
    }
  }

  private async switchSelectionFromDisk(collectionFilename: string | null): Promise<void> {
    const { pipelineWorkingCopy, openFolder, folders, diagnostics } = this.folder;
    const revision = ++this.selectionRevision;
    const folderAccess = openFolder.currentFolderAccess;
    const pipeline = pipelineWorkingCopy.pipeline;
    if (!pipeline) return;
    if (!folderAccess) {
      await this.reloadSelection({
        pipeline,
        collection: collectionFilename ? pipeline.getCollectionByFilename(collectionFilename) : null,
      });
      return;
    }
    const isStale = () => revision !== this.selectionRevision || openFolder.currentFolderAccess !== folderAccess
      || pipelineWorkingCopy.pipeline !== pipeline || pipelineWorkingCopy.hasDirtyClipSequenceChanges;
    try {
      const selection = await folders.refreshFolder(folderAccess);
      if (isStale()) return;
      const refreshed = await this.folder.pipelineFactory.buildPipeline({
        folderName: selection.folderName,
        files: selection.files,
        collectionFormat: this.folder.collectionFormat,
        logInvalidDescription: result => diagnostics.logInvalidDescription(result, selection.folderAccess),
      });
      if (isStale()) return;
      pipeline.setVideoSources(refreshed.pipeline.videoSources());
      pipeline.setCollections(refreshed.pipeline.collections());
      await this.reloadSelection({
        pipeline,
        collection: collectionFilename ? pipeline.getCollectionByFilename(collectionFilename) : null,
        folderAccess: selection.folderAccess,
      });
    } catch (error) {
      if (revision !== this.selectionRevision || openFolder.currentFolderAccess !== folderAccess) return;
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
