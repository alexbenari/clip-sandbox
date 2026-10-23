import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionSaveWorkflow } from './collection-save-workflow.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { FolderSelectionWorkflow } from './folder-selection-workflow.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

type TrashRequest = Readonly<{
  // Kept so a confirmation never moves same-named files from a folder opened since.
  folderAccess: FolderAccess;
  selectedClipIds: string[];
  selectedClipNames: string[];
  affectedSavedCollectionCount: number;
}>;

type FailedTrash = Readonly<{ filename: string; error?: unknown; code?: string }>;
type FailedCollectionRewrite = Readonly<{ filename: string; collectionName: string; error: unknown }>;

type TrashOutcome = Readonly<{
  trashedClipIds: string[];
  failedTrashes: FailedTrash[];
  cleanedSavedCollectionCount: number;
  failedCollectionRewrites: FailedCollectionRewrite[];
}>;

export interface ITrashClipsDialog {
  openPreflight(request: { text: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }): void;
  openConfirmForTrashRequest(request: TrashRequest, handlers: { onConfirm: () => void; onCancel: () => void }): void;
  closePreflight(): void;
  closeConfirm(): void;
  closeAll(): void;
}

export interface IActiveFolderCheck {
  isActiveFolder(folderAccess: FolderAccess | null, folderPath: string): boolean;
}

export interface IClipFileTrash {
  trashFiles(request: { folderAccess: FolderAccess | null; filenames: string[] }): Promise<{
    code: string;
    results: ReadonlyArray<{ filename: string; ok: boolean; code?: string; error?: unknown }>;
  }>;
}

type TrashClipsDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'activeCollectionFilename' | 'currentClipSequence' | 'isPipelineMode'
    | 'hasDirtyClipSequenceChanges' | 'clipNamesForIdsInOrder'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  folders: IActiveFolderCheck;
  files: IClipFileTrash;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  dialog: ITrashClipsDialog;
  grid: IEventSource<{ removeSelectedRequested: string[] }> & { getSelectedClipIds(): string[]; invalidateAllViews(): void };
  toolbar: IEventSource<{ trashSelectedRequested: void }>;
  zoom: { isOpen(): boolean };
  collectionSave: Pick<CollectionSaveWorkflow, 'saveActive'>;
  folderSelection: Pick<FolderSelectionWorkflow, 'reloadSelection'>;
  collectionView: Pick<CollectionViewWorkflow, 'refreshToolbar'>;
  diagnostics: Pick<AppDiagnostics, 'logTrashFailures'>;
  reporter: Pick<ActivityReporter, 'success' | 'failure'>;
  appText: Pick<AppText, 'trashClipsPreflightText' | 'trashClipsResultText'>;
}>;

export class TrashClipsWorkflow {
  private pendingRequest: TrashRequest | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly trash: TrashClipsDependencies) {
    this.unsubscribes = [
      trash.toolbar.on('trashSelectedRequested', () => this.start()),
      trash.grid.on('removeSelectedRequested', () => this.startFromPipelineViewRemoval()),
    ];
  }

  start(): void {
    const request = this.requestFromSelection();
    if (!request) return;
    this.pendingRequest = request;
    if (this.trash.pipelineWorkingCopy.hasDirtyClipSequenceChanges) {
      this.openPreflight();
      return;
    }
    this.openConfirmation(request);
  }

  discardPendingRequest(): void {
    this.pendingRequest = null;
    this.trash.dialog.closeAll();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  // Removing selected clips from the pipeline view moves their files to the trash; a collection view only drops them.
  private startFromPipelineViewRemoval(): void {
    const { pipelineWorkingCopy } = this.trash;
    if (this.trash.zoom.isOpen() || !pipelineWorkingCopy.currentClipSequence || !pipelineWorkingCopy.isPipelineMode()) return;
    this.start();
  }

  private requestFromSelection(): TrashRequest | null {
    const { pipelineWorkingCopy } = this.trash;
    const pipeline = pipelineWorkingCopy.pipeline;
    const folderAccess = this.trash.openFolder.currentFolderAccess;
    if (!pipelineWorkingCopy.currentClipSequence || !pipeline || !folderAccess) return null;
    const selectedClipIds = this.trash.grid.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = pipelineWorkingCopy.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) return null;
    return {
      folderAccess,
      selectedClipIds,
      selectedClipNames,
      affectedSavedCollectionCount: pipeline.savedCollectionEntriesContainingClipNames(selectedClipNames).length,
    };
  }

  private openPreflight(): void {
    this.trash.dialog.openPreflight({
      text: this.trash.appText.trashClipsPreflightText(),
      onSave: () => { void this.saveBeforeTrashing(); },
      onDiscard: () => this.continueWithoutSaving(),
      onCancel: () => this.discardPendingRequest(),
    });
  }

  private openConfirmation(request: TrashRequest): void {
    this.trash.dialog.openConfirmForTrashRequest(request, {
      onConfirm: () => { void this.trashConfirmedRequest(); },
      onCancel: () => this.discardPendingRequest(),
    });
  }

  private async saveBeforeTrashing(): Promise<void> {
    const request = this.pendingRequest;
    if (!request) return;
    this.trash.dialog.closePreflight();
    const outcome = await this.trash.collectionSave.saveActive();
    if (this.pendingRequest !== request) return;
    if (outcome === 'cancelled') {
      this.pendingRequest = null;
      return;
    }
    if (outcome === 'failed') {
      this.openPreflight();
      return;
    }
    if (!this.isForOpenFolder(request)) {
      this.pendingRequest = null;
      this.reportFolderChanged(request);
      return;
    }
    this.openConfirmation(request);
  }

  private continueWithoutSaving(): void {
    if (!this.pendingRequest) return;
    this.trash.dialog.closePreflight();
    this.openConfirmation(this.pendingRequest);
  }

  private async trashConfirmedRequest(): Promise<void> {
    const { pipelineWorkingCopy, appText, reporter } = this.trash;
    const request = this.pendingRequest;
    const pipeline = pipelineWorkingCopy.pipeline;
    if (!request || !pipelineWorkingCopy.currentClipSequence || !pipeline) return;
    this.trash.dialog.closeConfirm();
    this.pendingRequest = null;
    if (!this.isForOpenFolder(request)) {
      this.reportFolderChanged(request);
      return;
    }

    const outcome = await this.trashFilesAndUpdatePipeline(request, pipeline);
    if (!outcome) {
      reporter.failure(appText.trashClipsResultText({
        trashedCount: 0,
        failedTrashCount: request.selectedClipNames.length,
        cleanedSavedCollectionCount: 0,
        failedCollectionRewriteCount: 0,
      }), {
        affected: request.selectedClipNames.join(', '),
        recovery: 'Open the folder again, then retry.',
        technicalDetails: 'Disk access is unavailable because no folder is open.',
      });
      return;
    }

    if (outcome.trashedClipIds.length > 0) {
      this.trash.grid.invalidateAllViews();
      await this.trash.folderSelection.reloadSelection({
        pipeline,
        // Removing videos replaced each affected collection; the session still holds the version with the trashed clips.
        collection: pipeline.getCollectionByFilename(pipelineWorkingCopy.activeCollectionFilename()),
        folderAccess: this.trash.openFolder.currentFolderAccess,
      });
    } else {
      this.trash.collectionView.refreshToolbar();
    }

    const anyFailed = outcome.failedTrashes.length > 0 || outcome.failedCollectionRewrites.length > 0;
    if (anyFailed) await this.trash.diagnostics.logTrashFailures(outcome);
    const statusText = appText.trashClipsResultText({
      trashedCount: outcome.trashedClipIds.length,
      failedTrashCount: outcome.failedTrashes.length,
      cleanedSavedCollectionCount: outcome.cleanedSavedCollectionCount,
      failedCollectionRewriteCount: outcome.failedCollectionRewrites.length,
    });
    if (anyFailed || outcome.trashedClipIds.length === 0) {
      this.reportFailedTrash(statusText, outcome);
      return;
    }
    reporter.success(statusText, 4500);
  }

  private async trashFilesAndUpdatePipeline(request: TrashRequest, pipeline: Pipeline): Promise<TrashOutcome | null> {
    const trashResult = await this.trash.files.trashFiles({
      folderAccess: request.folderAccess,
      filenames: request.selectedClipNames,
    });
    if (trashResult.code === 'unavailable') return null;
    const trashedClipNames = trashResult.results.filter(entry => entry.ok).map(entry => entry.filename);
    const failedTrashes = trashResult.results.filter(entry => !entry.ok);
    const clipIdByName = new Map(request.selectedClipNames.map((name, index) => [name, request.selectedClipIds[index]]));
    const trashedClipIds = trashedClipNames.flatMap(name => {
      const clipId = clipIdByName.get(name);
      return clipId ? [clipId] : [];
    });
    const rewrites = await this.rewriteCollectionsWithout(pipeline, trashedClipNames);
    return { trashedClipIds, failedTrashes, ...rewrites };
  }

  private async rewriteCollectionsWithout(pipeline: Pipeline, trashedClipNames: string[]) {
    const changedCollections = trashedClipNames.length > 0 ? pipeline.removeVideos(trashedClipNames).changedCollections : [];
    const failedCollectionRewrites: FailedCollectionRewrite[] = [];
    let cleanedSavedCollectionCount = 0;
    for (const entry of changedCollections) {
      try {
        await this.trash.fileWriter.write(entry.collection);
        cleanedSavedCollectionCount += 1;
      } catch (error) {
        pipeline.upsertCollection(entry.previousCollection);
        failedCollectionRewrites.push({ filename: entry.filename, collectionName: entry.collectionName, error });
      }
    }
    return { cleanedSavedCollectionCount, failedCollectionRewrites };
  }

  // A refresh of the same folder replaces its access object, so the folder is compared by path.
  private isForOpenFolder(request: TrashRequest): boolean {
    return this.trash.folders.isActiveFolder(this.trash.openFolder.currentFolderAccess, request.folderAccess.folderPath);
  }

  private reportFolderChanged(request: TrashRequest): void {
    this.trash.reporter.failure('Nothing was moved to the Recycle Bin because another folder was opened.', {
      affected: request.selectedClipNames.join(', '),
      recovery: 'Select the clips again in the open folder, then move them again.',
    });
  }

  private reportFailedTrash(statusText: string, outcome: TrashOutcome): void {
    const failedTrashDetails = outcome.failedTrashes.map(({ filename, error }) =>
      `${filename}: ${error instanceof Error ? error.message : String(error || 'Could not move to the Recycle Bin')}`);
    const failedRewriteDetails = outcome.failedCollectionRewrites.map(({ collectionName, filename, error }) =>
      `${collectionName} (${filename}): ${error instanceof Error ? error.message : String(error || 'Collection update failed')}`);
    this.trash.reporter.failure(statusText, {
      affected: [...outcome.failedTrashes.map(({ filename }) => filename),
        ...outcome.failedCollectionRewrites.map(({ collectionName }) => collectionName)].join(', '),
      recovery: 'Close any player using the clip, then try again.',
      technicalDetails: [...failedTrashDetails, ...failedRewriteDetails].join('\n') || 'No file was moved.',
    });
  }
}
