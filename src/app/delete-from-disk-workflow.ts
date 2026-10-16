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
import type { PipelineSession } from './pipeline-session.js';

type DeleteRequest = Readonly<{
  selectedClipIds: string[];
  selectedClipNames: string[];
  affectedSavedCollectionCount: number;
}>;

type FailedDelete = Readonly<{ filename: string; error?: unknown; code?: string }>;
type FailedCollectionRewrite = Readonly<{ filename: string; collectionName: string; error: unknown }>;

type DeleteOutcome = Readonly<{
  deletedClipIds: string[];
  failedDeletes: FailedDelete[];
  cleanedSavedCollectionCount: number;
  failedCollectionRewrites: FailedCollectionRewrite[];
}>;

export interface IDeleteFromDiskDialog {
  openPreflight(request: { text: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }): void;
  openConfirmForDeleteRequest(request: DeleteRequest, handlers: { onConfirm: () => void; onCancel: () => void }): void;
  closePreflight(): void;
  closeConfirm(): void;
  closeAll(): void;
}

export interface IFileDeleter {
  deleteFiles(request: { folderSession: FolderAccess | null; filenames: string[] }): Promise<{
    code: string;
    results: ReadonlyArray<{ filename: string; ok: boolean; code?: string; error?: unknown }>;
  }>;
}

type DeleteFromDiskDependencies = Readonly<{
  pipelineSession: Pick<PipelineSession, 'pipeline' | 'activeCollectionFilename' | 'currentClipSequence' | 'isPipelineMode'
    | 'hasDirtyClipSequenceChanges' | 'clipNamesForIdsInOrder'>;
  openFolder: Pick<AppSessionState, 'currentFolderSession'>;
  files: IFileDeleter;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  dialog: IDeleteFromDiskDialog;
  grid: IEventSource<{ removeSelectedRequested: string[] }> & { getSelectedClipIds(): string[]; invalidateAllViews(): void };
  toolbar: IEventSource<{ deleteFromDiskRequested: void }>;
  zoom: { isOpen(): boolean };
  collectionSave: Pick<CollectionSaveWorkflow, 'saveActive'>;
  folderSelection: Pick<FolderSelectionWorkflow, 'reloadSelection'>;
  collectionView: Pick<CollectionViewWorkflow, 'refreshToolbar'>;
  diagnostics: Pick<AppDiagnostics, 'logDeleteFailures'>;
  reporter: Pick<ActivityReporter, 'success' | 'failure'>;
  appText: Pick<AppText, 'deleteFromDiskPreflightText' | 'deleteFromDiskResultText'>;
}>;

export class DeleteFromDiskWorkflow {
  private pendingRequest: DeleteRequest | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deletion: DeleteFromDiskDependencies) {
    this.unsubscribes = [
      deletion.toolbar.on('deleteFromDiskRequested', () => this.start()),
      deletion.grid.on('removeSelectedRequested', () => this.startFromPipelineViewRemoval()),
    ];
  }

  start(): void {
    const request = this.requestFromSelection();
    if (!request) return;
    this.pendingRequest = request;
    if (this.deletion.pipelineSession.hasDirtyClipSequenceChanges) {
      this.openPreflight();
      return;
    }
    this.openConfirmation(request);
  }

  discardPendingRequest(): void {
    this.pendingRequest = null;
    this.deletion.dialog.closeAll();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  // Removing selected clips from the pipeline view means deleting their files; a collection view only drops them.
  private startFromPipelineViewRemoval(): void {
    const { pipelineSession } = this.deletion;
    if (this.deletion.zoom.isOpen() || !pipelineSession.currentClipSequence || !pipelineSession.isPipelineMode()) return;
    this.start();
  }

  private requestFromSelection(): DeleteRequest | null {
    const { pipelineSession } = this.deletion;
    const pipeline = pipelineSession.pipeline;
    if (!pipelineSession.currentClipSequence || !pipeline) return null;
    const selectedClipIds = this.deletion.grid.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) return null;
    return {
      selectedClipIds,
      selectedClipNames,
      affectedSavedCollectionCount: pipeline.savedCollectionEntriesContainingClipNames(selectedClipNames).length,
    };
  }

  private openPreflight(): void {
    this.deletion.dialog.openPreflight({
      text: this.deletion.appText.deleteFromDiskPreflightText(),
      onSave: () => { void this.saveBeforeDeleting(); },
      onDiscard: () => this.continueWithoutSaving(),
      onCancel: () => this.discardPendingRequest(),
    });
  }

  private openConfirmation(request: DeleteRequest): void {
    this.deletion.dialog.openConfirmForDeleteRequest(request, {
      onConfirm: () => { void this.deleteConfirmedRequest(); },
      onCancel: () => this.discardPendingRequest(),
    });
  }

  private async saveBeforeDeleting(): Promise<void> {
    const request = this.pendingRequest;
    if (!request) return;
    this.deletion.dialog.closePreflight();
    const outcome = await this.deletion.collectionSave.saveActive();
    if (this.pendingRequest !== request) return;
    if (outcome === 'cancelled') {
      this.pendingRequest = null;
      return;
    }
    if (outcome === 'failed') {
      this.openPreflight();
      return;
    }
    this.openConfirmation(request);
  }

  private continueWithoutSaving(): void {
    if (!this.pendingRequest) return;
    this.deletion.dialog.closePreflight();
    this.openConfirmation(this.pendingRequest);
  }

  private async deleteConfirmedRequest(): Promise<void> {
    const { pipelineSession, appText, reporter } = this.deletion;
    const request = this.pendingRequest;
    const pipeline = pipelineSession.pipeline;
    if (!request || !pipelineSession.currentClipSequence || !pipeline) return;
    this.deletion.dialog.closeConfirm();
    this.pendingRequest = null;

    const outcome = await this.deleteFilesAndUpdatePipeline(request, pipeline);
    if (!outcome) {
      reporter.failure(appText.deleteFromDiskResultText({
        deletedCount: 0,
        failedDeleteCount: request.selectedClipNames.length,
        cleanedSavedCollectionCount: 0,
        failedCollectionRewriteCount: 0,
      }), {
        affected: request.selectedClipNames.join(', '),
        recovery: 'Open the folder again before retrying the deletion.',
        technicalDetails: 'Disk access is unavailable for the current folder session.',
      });
      return;
    }

    if (outcome.deletedClipIds.length > 0) {
      this.deletion.grid.invalidateAllViews();
      await this.deletion.folderSelection.reloadSelection({
        pipeline,
        // Removing videos replaced each affected collection; the session still holds the version with the deleted clips.
        collection: pipeline.getCollectionByFilename(pipelineSession.activeCollectionFilename()),
        folderSession: this.deletion.openFolder.currentFolderSession,
      });
    } else {
      this.deletion.collectionView.refreshToolbar();
    }

    const anyFailed = outcome.failedDeletes.length > 0 || outcome.failedCollectionRewrites.length > 0;
    if (anyFailed) await this.deletion.diagnostics.logDeleteFailures(outcome);
    const statusText = appText.deleteFromDiskResultText({
      deletedCount: outcome.deletedClipIds.length,
      failedDeleteCount: outcome.failedDeletes.length,
      cleanedSavedCollectionCount: outcome.cleanedSavedCollectionCount,
      failedCollectionRewriteCount: outcome.failedCollectionRewrites.length,
    });
    if (anyFailed || outcome.deletedClipIds.length === 0) {
      this.reportFailedDeletion(statusText, outcome);
      return;
    }
    reporter.success(statusText, 4500);
  }

  private async deleteFilesAndUpdatePipeline(request: DeleteRequest, pipeline: Pipeline): Promise<DeleteOutcome | null> {
    const deleteResult = await this.deletion.files.deleteFiles({
      folderSession: this.deletion.openFolder.currentFolderSession,
      filenames: request.selectedClipNames,
    });
    if (deleteResult.code === 'unavailable') return null;
    const deletedClipNames = deleteResult.results.filter(entry => entry.ok).map(entry => entry.filename);
    const failedDeletes = deleteResult.results.filter(entry => !entry.ok);
    const clipIdByName = new Map(request.selectedClipNames.map((name, index) => [name, request.selectedClipIds[index]]));
    const deletedClipIds = deletedClipNames.flatMap(name => {
      const clipId = clipIdByName.get(name);
      return clipId ? [clipId] : [];
    });
    const rewrites = await this.rewriteCollectionsWithout(pipeline, deletedClipNames);
    return { deletedClipIds, failedDeletes, ...rewrites };
  }

  private async rewriteCollectionsWithout(pipeline: Pipeline, deletedClipNames: string[]) {
    const changedCollections = deletedClipNames.length > 0 ? pipeline.removeVideos(deletedClipNames).changedCollections : [];
    const failedCollectionRewrites: FailedCollectionRewrite[] = [];
    let cleanedSavedCollectionCount = 0;
    for (const entry of changedCollections) {
      try {
        await this.deletion.fileWriter.write(entry.collection);
        cleanedSavedCollectionCount += 1;
      } catch (error) {
        pipeline.upsertCollection(entry.previousCollection);
        failedCollectionRewrites.push({ filename: entry.filename, collectionName: entry.collectionName, error });
      }
    }
    return { cleanedSavedCollectionCount, failedCollectionRewrites };
  }

  private reportFailedDeletion(statusText: string, outcome: DeleteOutcome): void {
    const failedDeleteDetails = outcome.failedDeletes.map(({ filename, error }) =>
      `${filename}: ${error instanceof Error ? error.message : String(error || 'Delete failed')}`);
    const failedRewriteDetails = outcome.failedCollectionRewrites.map(({ collectionName, filename, error }) =>
      `${collectionName} (${filename}): ${error instanceof Error ? error.message : String(error || 'Collection update failed')}`);
    this.deletion.reporter.failure(statusText, {
      affected: [...outcome.failedDeletes.map(({ filename }) => filename),
        ...outcome.failedCollectionRewrites.map(({ collectionName }) => collectionName)].join(', '),
      recovery: 'Close any player using the clip, then try deleting it again.',
      technicalDetails: [...failedDeleteDetails, ...failedRewriteDetails].join('\n') || 'No file was deleted.',
    });
  }
}
