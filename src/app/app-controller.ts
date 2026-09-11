import { GlobalUtilityCoordinator, GLOBAL_UTILITY_SHORTCUTS } from '../ui/global-utility-coordinator.js';
import { KeyboardMapControl } from '../ui/keyboard-map-control.js';
import { PipelineFactory } from '../business-logic/PipelineFactory.js';
import { ClipEditor } from '../business-logic/clip-editor.js';
import type { AddToCollectionDestination } from '../ui/add-to-collection-dialog-controller.js';
import type { ContextMenuPoint } from '../ui/context-menu-controller.js';
import type { Clip, ClipFile } from '../domain/clip.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Pipeline, RemovedCollectionChange } from '../domain/pipeline.js';
import { VideoEditCatalog, type VideoEdit } from '../business-logic/video-edit-catalog.js';
import { AppSessionState } from './app-session-state.js';
import { PipelineSession } from './pipeline-session.js';
import { FullscreenAdapter } from '../adapters/browser/fullscreen-adapter.js';
import { ElectronFileSystemService } from '../adapters/electron/electron-file-system-service.js';
import { ClockAdapter } from '../adapters/browser/clock-adapter.js';
import { AudioFeedbackAdapter } from '../adapters/browser/audio-feedback-adapter.js';
import { FullscreenSession } from './fullscreen-session.js';
import { AppDiagnostics } from './app-diagnostics.js';
import { AppKeyDownHandler } from './app-keydown-handler.js';
import { ZoomVideoEditWorkflow, VideoEditNotificationError } from './zoom-video-edit-workflow.js';
import { ApplicationEventController } from './application-event-controller.js';
import { DisplayLayoutRules } from '../ui/display-layout-rules.js';
import { AppText } from './app-text.js';
import { CollectionNameValidator } from './collection-name-validator.js';
import { OrderMenuController } from '../ui/order-menu-controller.js';
import { AddToCollectionDialogController } from '../ui/add-to-collection-dialog-controller.js';
import { CollectionSelectorControl } from '../ui/collection-selector-control.js';
import { MainToolbarControl } from '../ui/main-toolbar-control.js';
import { ApplicationShellController } from '../ui/application-shell-controller.js';
import { CollectionScreen } from '../ui/collection-screen.js';
import { SettingsScreen } from '../ui/settings-screen.js';
import { AppSettingsService } from './app-settings-service.js';
import { AppSettingsParser } from './app-settings.js';
import { ElectronAppSettingsService } from '../adapters/electron/electron-app-settings-service.js';
import { ActivityIndicatorControl, type ActivityErrorOptions } from '../ui/activity-indicator-control.js';
import { ContextMenuController } from '../ui/context-menu-controller.js';
import { GridContextMenuControl } from '../ui/grid-context-menu-control.js';
import { ZoomEditMenuControl } from '../ui/zoom-edit-menu-control.js';
import { ZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { ClipCollectionGridController } from '../ui/clip-collection-grid-controller.js';
import { ClipLabelFormatter } from '../ui/clip-label-formatter.js';
import { CollectionConflictController } from '../ui/collection-conflict-controller.js';
import { DeleteFromDiskDialogController } from '../ui/delete-from-disk-dialog-controller.js';
import { SaveAsNewDialogController } from '../ui/save-as-new-dialog-controller.js';
import { UnsavedChangesDialogController } from '../ui/unsaved-changes-dialog-controller.js';
import { LoadStatusControl } from '../ui/load-status-control.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { Collection } from '../domain/collection.js';

const ERROR_LOG_FILENAME = 'err.log';
const NEW_COLLECTION_CHOICE_VALUE = '__new_collection__';
const PIPELINE_SELECTION_VALUE = '__pipeline__';

type FolderSelection = {
  folderSession: unknown;
  files: ClipFile[];
  folderName: string;
};

type DeleteRequest = {
  selectedClipIds: string[];
  selectedClipNames: string[];
  affectedSavedCollectionCount: number;
  awaitingSave?: boolean;
};

type AddToCollectionResult =
  | { ok: false; code: string; error?: unknown; destinationName?: string }
  | {
    ok: true;
    code: string;
    saveMode: string | null | undefined;
    collection: Collection;
    destinationName: string;
    addedCount: number;
    skippedCount: number;
    isNoOp?: boolean;
  };

type SaveCollectionResult =
  | { deferred: true }
  | SaveClipSequenceResult;

type SaveClipSequenceResult =
  | { ok: false; code: string; error?: unknown; collection?: Collection | null }
  | { ok: true; code: 'saved'; mode: string | undefined; collection: Collection };

type PersistCollectionResult = {
  ok: true;
  mode: string | undefined;
  collection: Collection;
};

class AppControllerSupport {
  static folderSessionWithPath(folderSession: unknown): { folderPath?: string } | null {
  if (typeof folderSession !== 'object' || folderSession === null) return null;
  const folderPath = (folderSession as { folderPath?: unknown }).folderPath;
  return typeof folderPath === 'string' && folderPath ? { folderPath } : null;
}

  static isDeferredSaveResult(result: SaveCollectionResult | null | undefined): result is { deferred: true } {
  return !!result && 'deferred' in result && result.deferred === true;
}

  static isSuccessfulSaveResult(result: SaveCollectionResult | null | undefined): result is Extract<SaveClipSequenceResult, { ok: true }> {
  return !!result && 'ok' in result && result.ok === true;
}

  static requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found.`);
  return element as T;
}

  static optionalElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
  }
}

export class AppController {
  private initialized = false;

  init(): void {
  if (this.initialized) return;
    class AppWorkflows {
    readonly showStatus = (msg: string, timeout = 2500): void => {
        activityIndicatorControl.show(msg, timeout);
      };

    readonly showErrorStatus = (msg: string, options?: ActivityErrorOptions): void => {
        activityIndicatorControl.showError(msg, options);
      };

    readonly showProgressStatus = (msg: string): void => {
        activityIndicatorControl.showProgress(msg);
      };

    readonly currentPipeline = (): Pipeline | null => {
        return pipelineSession.pipeline;
      };

    readonly activeCollection = (): Collection | null => {
        return pipelineSession.activeCollection;
      };

    readonly currentClipSequence = (): ClipSequence | null => {
        return pipelineSession.currentClipSequence;
      };

    readonly isPipelineMode = (): boolean => {
        return pipelineSession.isPipelineMode();
      };

    readonly activeCollectionFilename = (): string => {
        return pipelineSession.activeCollectionFilename();
      };

    readonly gridViewCacheKeyForCollection = (collection: Collection | null = this.activeCollection()): string => {
        return collection?.filename ? `collection:${collection.filename}` : 'pipeline';
      };

    readonly activeGridViewCacheKey = (): string => {
        return this.gridViewCacheKeyForCollection(this.activeCollection());
      };

    readonly isFullscreen = (): boolean => {
        return fullscreenAdapter.isFullScreenActive();
      };

    readonly refreshCollectionSelectorView = () => {
        collectionSelectorControl.render({
          pipeline: this.currentPipeline(),
          activeCollection: this.activeCollection(),
          currentClipSequence: this.currentClipSequence(),
        });
      };

    readonly refreshToolbarView = () => {
        mainToolbarControl.render({
          clipCount: gridController?.getCardCount?.() ?? grid.children.length,
          hasPipeline: !!this.currentPipeline(),
          hasSequence: !!this.currentClipSequence(),
          hasSelection: gridController?.getSelectedClipIds?.().length > 0,
          isPipelineMode: this.isPipelineMode(),
          titlesHidden: gridController?.areTitlesHidden?.() ?? false,
        });
      };

    readonly closeZoom = () => {
        clipContextMenuController.close({ restoreFocus: false });
        zoomOverlay.close();
      };

    readonly hideCollectionConflict = () => {
        collectionConflictController.hide();
      };

    readonly cancelSaveAsNewFlow = () => {
        saveAsNewDialogController.close();
        if (pendingDeleteRequest?.awaitingSave) {
          pendingDeleteRequest = null;
        }
        state.clearPendingSelectionAction();
        this.refreshCollectionSelectorView();
      };

    readonly openSaveAsNewDialog = () => {
        saveAsNewDialogController.open({ isPipelineMode: this.isPipelineMode() });
      };

    readonly openAddToCollectionDialog = ({ startWithNewCollection = false }: { startWithNewCollection?: boolean } = {}): void => {
        if (!this.currentPipeline()) return;
        addToCollectionDialogController.open({
          choices: AddToCollectionDialogController.buildChoices({
            pipeline: this.currentPipeline(),
            activeCollectionFilename: this.activeCollectionFilename(),
          }),
          hasSelection: gridController?.getSelectedClipIds?.().length > 0,
          startWithNewCollection,
        });
      };

    readonly runAddToCollection = async (destination: AddToCollectionDestination, { showDialogValidation = false }: { showDialogValidation?: boolean } = {}) => {
        const pipeline = this.currentPipeline();
        if (!this.currentClipSequence() || !pipeline) return { ok: false, code: 'missing-context' };
        const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(gridController.getSelectedClipIds());
        if (selectedClipNames.length === 0) return { ok: false, code: 'no-selection' };

        let targetCollectionFilename = '';
        if (destination.kind === 'existing') {
          targetCollectionFilename = String(destination.collectionFilename || '').trim();
        } else if (destination.kind === 'new') {
          const validation = Collection.validateCollectionName(destination.name);
          if (!validation.ok) {
            const validationError = collectionNameValidator.validationErrorText(validation.code);
            if (showDialogValidation && validationError) {
              addToCollectionDialogController.showValidationError(validationError, { focusNameInput: true });
            }
            return { ok: false, code: validation.code };
          }
          if (pipeline.getCollectionByFilename(validation.filename)) {
            const validationError = collectionNameValidator.validationErrorText('already-exists');
            if (showDialogValidation && validationError) {
              addToCollectionDialogController.showValidationError(validationError, { focusNameInput: true });
            }
            return { ok: false, code: 'already-exists' };
          }
          if (validation.filename === this.activeCollectionFilename()) {
            return { ok: false, code: 'invalid-destination' };
          }
          targetCollectionFilename = validation.filename;
        }

        const mutation = pipeline.addClipsToCollection({
          collectionFilename: targetCollectionFilename,
          clipNames: selectedClipNames,
        });
        if (!mutation.ok || mutation.isNoOp) {
          const result = {
            ...mutation,
            saveMode: null,
          };
          if (result.ok) {
            addToCollectionDialogController.close();
            this.refreshCollectionSelectorView();
            this.refreshToolbarView();
            this.showStatus(appText.addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
          }
          return result;
        }

        let result: AddToCollectionResult;
        try {
          const { mode: saveMode } = await this.persistCollection(mutation.collection);
          result = {
            ...mutation,
            saveMode,
          };
        } catch (error) {
          if (mutation.previousCollection) {
            pipeline.upsertCollection(mutation.previousCollection);
          } else if (mutation.filename) {
            pipeline.removeCollection(mutation.filename);
          }
          result = {
            ok: false,
            code: 'save-failed',
            error,
            destinationName: mutation.destinationName,
          };
        }

        if (!result.ok) {
          const validationError = collectionNameValidator.validationErrorText(String(result.code));
          if (showDialogValidation && validationError) {
            addToCollectionDialogController.showValidationError(validationError, {
              focusNameInput: destination.kind === 'new',
            });
            return result;
          }
          if (showDialogValidation) addToCollectionDialogController.close();
          const failureDetail = 'error' in result ? result.error || result.code : result.code;
          this.showErrorStatus(appText.addSelectedClipsFailedText(result.destinationName || '', failureDetail), {
            affected: result.destinationName || 'Add to collection',
            recovery: 'Check folder access, then add the selected clips again.',
            technicalDetails: failureDetail instanceof Error ? failureDetail.stack ?? failureDetail.message : String(failureDetail),
          });
          return result;
        }

        gridController.invalidateView(this.gridViewCacheKeyForCollection(result.collection));
        addToCollectionDialogController.close();
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
        this.showStatus(appText.addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
        return result;
      };

    readonly openUnsavedDialog = () => {
        const action = state.getPendingSelectionAction();
        unsavedChangesDialogController.open({
          message: action?.type === 'browse-folder'
            ? 'The current view has unsaved changes. Save before browsing to another folder?'
            : 'The current view has unsaved changes. Save before switching views?',
          onSave: () => {
            void this.continuePendingAction({ saveFirst: true });
          },
          onDiscard: () => {
            void this.continuePendingAction({ saveFirst: false });
          },
          onCancel: () => {
            state.clearPendingSelectionAction();
            this.refreshCollectionSelectorView();
          },
        });
      };

    readonly closeUnsavedDialog = () => {
        unsavedChangesDialogController.close();
      };

    readonly buildDeleteRequestFromSelection = (): DeleteRequest | null => {
        const pipeline = this.currentPipeline();
        if (!this.currentClipSequence() || !pipeline) return null;
        const selectedClipIds = gridController.getSelectedClipIds();
        if (selectedClipIds.length === 0) return null;
        const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(selectedClipIds);
        if (selectedClipNames.length === 0) return null;
        return {
          selectedClipIds,
          selectedClipNames,
          affectedSavedCollectionCount: pipeline.savedCollectionEntriesContainingClipNames(selectedClipNames).length,
        };
      };

    readonly openDeletePreflightDialog = () => {
        deleteFromDiskDialogController.openPreflight({
          text: appText.deleteFromDiskPreflightText(),
          onSave: () => {
            void this.confirmDeletePreflightSave();
          },
          onDiscard: this.continueDeleteWithoutSaving,
          onCancel: this.cancelPendingDeleteFlow,
        });
      };

    readonly openDeleteFromDiskDialog = (deleteRequest: DeleteRequest): void => {
        deleteFromDiskDialogController.openConfirmForDeleteRequest(deleteRequest, {
          onConfirm: () => {
            void this.confirmDeleteFromDisk();
          },
          onCancel: this.cancelPendingDeleteFlow,
        });
      };

    readonly cancelPendingDeleteFlow = () => {
        pendingDeleteRequest = null;
        deleteFromDiskDialogController.closeAll();
      };

    readonly confirmDeleteFromDisk = async (): Promise<void> => {
        const deleteRequest = pendingDeleteRequest;
        const pipeline = this.currentPipeline();
        if (!deleteRequest || !this.currentClipSequence() || !pipeline) return;
        deleteFromDiskDialogController.closeConfirm();
        pendingDeleteRequest = null;

        const deleteResult = await fileSystem.deleteFiles({
          folderSession: state.currentFolderSession,
          filenames: deleteRequest.selectedClipNames,
        });
        if (deleteResult.code === 'unavailable') {
          this.showErrorStatus(appText.deleteFromDiskResultText({
            deletedCount: 0,
            failedDeleteCount: deleteRequest.selectedClipNames.length,
            cleanedSavedCollectionCount: 0,
            failedCollectionRewriteCount: 0,
          }));
          return;
        }

        const deletedClipNames = deleteResult.results
          .filter((entry) => entry.ok)
          .map((entry) => entry.filename);
        const failedDeletes = deleteResult.results.filter((entry) => !entry.ok);
        const clipIdByName = new Map(deleteRequest.selectedClipNames.map((name, index) => [name, deleteRequest.selectedClipIds[index]]));
        const deletedClipIds = deletedClipNames.flatMap((name) => {
          const clipId = clipIdByName.get(name);
          return clipId ? [clipId] : [];
        });

        let changedCollections: RemovedCollectionChange[] = [];
        if (deletedClipNames.length > 0) {
          changedCollections = pipeline.removeVideos(deletedClipNames).changedCollections;
        }

        const failedCollectionRewrites: Array<{ filename: string; collectionName: string; error: unknown }> = [];
        let cleanedSavedCollectionCount = 0;
        for (const entry of changedCollections) {
          try {
            await this.persistCollection(entry.collection);
            cleanedSavedCollectionCount += 1;
          } catch (error) {
            pipeline.upsertCollection(entry.previousCollection);
            failedCollectionRewrites.push({
              filename: entry.filename,
              collectionName: entry.collectionName,
              error,
            });
          }
        }

        const result = {
          ok: deletedClipNames.length > 0 && failedDeletes.length === 0 && failedCollectionRewrites.length === 0,
          code: deletedClipNames.length === 0
            ? 'delete-failed'
            : (failedDeletes.length === 0 && failedCollectionRewrites.length === 0 ? 'deleted' : 'partial'),
          selectedClipIds: Array.from(deleteRequest.selectedClipIds || []),
          selectedClipNames: Array.from(deleteRequest.selectedClipNames || []),
          deletedClipIds,
          deletedClipNames,
          failedDeletes,
          targetedSavedCollectionCount: changedCollections.length,
          cleanedSavedCollectionCount,
          failedCollectionRewrites,
        };

        if (result.deletedClipIds.length > 0) {
          gridController.invalidateAllViews();
          await this.reloadSelection({
            pipeline: this.currentPipeline(),
            collection: this.activeCollection(),
            folderSession: state.currentFolderSession,
          });
        } else {
          this.refreshToolbarView();
        }

        if (result.failedDeletes.length > 0 || result.failedCollectionRewrites.length > 0) {
          await diagnostics.logDeleteFailures(result);
        }

        const deleteStatusText = appText.deleteFromDiskResultText({
          deletedCount: result.deletedClipIds.length,
          failedDeleteCount: result.failedDeletes.length,
          cleanedSavedCollectionCount: result.cleanedSavedCollectionCount,
          failedCollectionRewriteCount: result.failedCollectionRewrites.length,
        });
        if (result.failedDeletes.length > 0 || result.failedCollectionRewrites.length > 0 || result.deletedClipIds.length === 0) {
          this.showErrorStatus(deleteStatusText);
          return;
        }
        this.showStatus(deleteStatusText, 4500);
      };

    readonly openDeleteFromDiskFlow = () => {
        const deleteRequest = this.buildDeleteRequestFromSelection();
        if (!deleteRequest) return;
        pendingDeleteRequest = deleteRequest;
        if (pipelineSession.hasDirtyClipSequenceChanges) {
          this.openDeletePreflightDialog();
          return;
        }
        this.openDeleteFromDiskDialog(deleteRequest);
      };

    readonly applySelection = (clipSequence: ClipSequence, {
        collection = this.activeCollection(),
        folderSession = state.currentFolderSession,
        statusText = '',
        timeout = 2500,
      }: {
        collection?: Collection | null;
        folderSession?: unknown;
        statusText?: string;
        timeout?: number;
      } = {}): void => {
        this.hideCollectionConflict();
        clipContextMenuController.close({ restoreFocus: false });
        addToCollectionDialogController.close();
        state.setCurrentFolderSession(folderSession || null);
        pipelineSession.activateSelection({ collection, sequence: clipSequence });
        gridController.renderCollection(clipSequence, {
          cacheKey: this.gridViewCacheKeyForCollection(collection),
        });
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
        if (statusText) this.showStatus(statusText, timeout);
      };

    readonly clearLoadedState = () => {
        this.hideCollectionConflict();
        pendingDeleteRequest = null;
        saveAsNewDialogController.close();
        addToCollectionDialogController.close();
        deleteFromDiskDialogController.closeAll();
        clipContextMenuController.close({ restoreFocus: false });
        this.closeUnsavedDialog();
        this.closeZoom();
        gridController.destroy();
        pipelineSession.reset();
        state.clearPendingSelectionAction();
        state.setCurrentFolderSession(null);
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
      };

    readonly queueMissingConflict = (
        conflict: Parameters<typeof collectionConflictController.showConflict>[0],
        handlers: Parameters<typeof collectionConflictController.showConflict>[1]
      ): void => {
        collectionConflictController.showConflict(conflict, handlers);
      };

    readonly reloadSelection = async ({
        pipeline = this.currentPipeline(),
        collection = this.activeCollection(),
        folderSession = state.currentFolderSession,
      }: {
        pipeline?: Pipeline | null;
        collection?: Collection | null;
        folderSession?: unknown;
      } = {}): Promise<void> => {
        if (!pipeline) return;
        const loaded = pipelineSession.materializeSelection(collection);
        if (!loaded) return;
        const { selection, materialization: result } = loaded;
        if (result.kind === 'has-missing') {
          this.queueMissingConflict(result, {
            onApply: () => {
              if (result.existingNamesInOrder.length === 0) {
                this.refreshCollectionSelectorView();
                this.showStatus(appText.noCollectionMatchesText(result.missingCount), 4500);
                return;
              }
              gridController.invalidateView(this.gridViewCacheKeyForCollection(collection));
              this.applySelection(result.partialSequence, {
                collection,
                folderSession,
                statusText: appText.collectionPartiallyLoadedText(result.existingNamesInOrder.length, result.missingCount),
                timeout: 4000,
              });
            },
            onCancel: () => {
              this.refreshCollectionSelectorView();
            },
          });
          return;
        }

        this.applySelection(result.sequence, {
          collection: selection instanceof Collection ? selection : null,
          folderSession,
        });
        loadStatusControl.showSelectionLoadStatus({
          isPipelineMode: selection === pipeline,
          clipCount: result.sequence.orderedClips().length,
        });
      };

    readonly loadPipeline = async ({ folderSession = null, files = [], folderName = '' }: Partial<FolderSelection> = {}): Promise<void> => {
        await settingsReady;
        try {
          const buildResult = await pipelineFactory.buildPipeline({
            folderName,
            files,
            validator,
            logInvalidDescription: (result) => diagnostics.logInvalidDescription(result, folderSession),
          });
          const { pipeline } = buildResult;
          const result = pipelineSession.loadPipeline(pipeline);
          if (!result) return;

          gridController.invalidateAllViews();
          gridController.retagActiveView(null);
          this.applySelection(result.sequence, {
            collection: null,
            folderSession,
          });
          loadStatusControl.showInitialLoadStatus({
            pipeline,
            clipCount: result.sequence.orderedClips().length,
          });
        } catch (err) {
          await diagnostics.logRuntimeError('Failed to load the selected folder.', err, folderSession);
          this.showErrorStatus(appText.collectionReadErrorText(err), {
            affected: 'Open folder', recovery: 'Check that the folder is accessible, then choose it again.',
            technicalDetails: err instanceof Error ? err.stack ?? err.message : String(err),
          });
        }
      };

    readonly triggerFolderPicker = async (): Promise<void> => {
        this.hideCollectionConflict();
        try {
          const selection = await fileSystem.pickFolder({
            onFileReadError: (info, folderSession) => {
              void diagnostics.logDirectoryReadError(
                info as Parameters<typeof diagnostics.logDirectoryReadError>[0],
                folderSession
              );
            },
          });
          await this.loadPipeline(selection);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          await diagnostics.logRuntimeError('Failed to browse for a folder.', err, state.currentFolderSession);
          this.showErrorStatus(appText.collectionReadErrorText(err), {
            affected: 'Open folder', recovery: 'Check that the folder is accessible, then choose it again.',
            technicalDetails: err instanceof Error ? err.stack ?? err.message : String(err),
          });
        }
      };

    readonly onPickFolder = async (): Promise<void> => {
        if (pipelineSession.hasDirtyClipSequenceChanges) {
          state.setPendingSelectionAction({ type: 'browse-folder' });
          this.refreshCollectionSelectorView();
          this.openUnsavedDialog();
          return;
        }
        await this.triggerFolderPicker();
      };

    readonly continuePendingAction = async ({ saveFirst }: { saveFirst: boolean }): Promise<void> => {
        const nextPendingAction = state.getPendingSelectionAction();
        if (!nextPendingAction) {
          this.closeUnsavedDialog();
          this.refreshCollectionSelectorView();
          return;
        }
        if (saveFirst) {
          const saveResult = await this.saveActiveCollection();
          if (AppControllerSupport.isDeferredSaveResult(saveResult)) return;
          if (!AppControllerSupport.isSuccessfulSaveResult(saveResult)) {
            this.openUnsavedDialog();
            return;
          }
        }
        this.closeUnsavedDialog();
        state.clearPendingSelectionAction();
        if (nextPendingAction.type === 'browse-folder') {
          await this.triggerFolderPicker();
          return;
        }
        if (nextPendingAction.type === 'switch-selection') {
          if (!saveFirst) {
            gridController.invalidateView(this.activeGridViewCacheKey());
            gridController.retagActiveView(null);
          }
          await this.reloadSelection({
            pipeline: this.currentPipeline(),
            collection: nextPendingAction.collectionFilename
              ? this.currentPipeline()?.getCollectionByFilename(nextPendingAction.collectionFilename)
              : null,
          });
          return;
        }
        this.refreshCollectionSelectorView();
      };

    readonly persistCollection = async (collection: Collection): Promise<PersistCollectionResult> => {
        if (!collection.filename) throw new Error('Collection filename is required.');
        const { mode } = await fileSystem.saveTextFile({
          folderSession: state.currentFolderSession,
          filename: collection.filename,
          text: collection.toText(),
        });
        return {
          ok: true,
          mode,
          collection,
        };
      };

    readonly saveClipSequenceAsCollection = async (filename: string): Promise<SaveClipSequenceResult> => {
        const pipeline = this.currentPipeline();
        if (!this.currentClipSequence() || !pipeline) {
          return { ok: false, code: 'missing-context' };
        }
        const collection = pipelineSession.collectionFromCurrentSequence(filename);
        if (!collection) return { ok: false, code: 'missing-context' };
        try {
          const { mode } = await this.persistCollection(collection);
          pipeline.upsertCollection(collection);
          return {
            ok: true,
            code: 'saved',
            mode,
            collection,
          };
        } catch (error) {
          return {
            ok: false,
            code: 'save-failed',
            error,
            collection,
          };
        }
      };

    readonly saveActiveCollection = async (): Promise<SaveCollectionResult | null> => {
        if (!this.currentClipSequence() || !this.currentPipeline()) return null;
        if (this.isPipelineMode()) {
          this.openSaveAsNewDialog();
          return { deferred: true };
        }
        const saveResult = await this.saveClipSequenceAsCollection(this.activeCollectionFilename());
        if (!saveResult?.ok) return saveResult;
        const savedCollection = saveResult.collection;
        pipelineSession.markCurrentSequenceSavedAs(savedCollection);
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
        this.showStatus(appText.savedCollectionFileText(savedCollection.filename || ''));
        return saveResult;
      };

    readonly confirmSaveAsNew = async (rawName: string): Promise<SaveCollectionResult | undefined> => {
        const validationError = collectionNameValidator.validate(rawName, this.currentPipeline());
        if (validationError) {
          saveAsNewDialogController.showValidationError(validationError, { focusInput: true });
          return;
        }
        const filename = Collection.filenameFromCollectionName(rawName);
        const saveResult = await this.saveClipSequenceAsCollection(filename);
        if (!saveResult?.ok) return saveResult;
        const savedCollection = saveResult.collection;
        const previousCacheKey = this.activeGridViewCacheKey();
        pipelineSession.markCurrentSequenceSavedAs(savedCollection);
        gridController.invalidateView(previousCacheKey);
        gridController.retagActiveView(this.activeGridViewCacheKey());
        saveAsNewDialogController.close();
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
        this.showStatus(appText.savedCollectionFileText(filename));
        if (pendingDeleteRequest?.awaitingSave) {
          pendingDeleteRequest.awaitingSave = false;
          this.openDeleteFromDiskDialog(pendingDeleteRequest);
          return;
        }
        if (state.getPendingSelectionAction()) {
          await this.continuePendingAction({ saveFirst: false });
        }
        return saveResult;
      };

    readonly confirmAddToCollection = async (destination: AddToCollectionDestination): Promise<void> => {
        if (!this.currentClipSequence() || !this.currentPipeline()) return;
        await this.runAddToCollection(destination, { showDialogValidation: true });
      };

    readonly confirmDeletePreflightSave = async (): Promise<void> => {
        if (!pendingDeleteRequest) return;
        deleteFromDiskDialogController.closePreflight();
        pendingDeleteRequest.awaitingSave = true;
        const saveResult = await this.saveActiveCollection();
        if (AppControllerSupport.isDeferredSaveResult(saveResult)) return;
        pendingDeleteRequest.awaitingSave = false;
        if (!AppControllerSupport.isSuccessfulSaveResult(saveResult)) {
          this.openDeletePreflightDialog();
          return;
        }
        this.openDeleteFromDiskDialog(pendingDeleteRequest);
      };

    readonly continueDeleteWithoutSaving = (): void => {
        if (!pendingDeleteRequest) return;
        deleteFromDiskDialogController.closePreflight();
        this.openDeleteFromDiskDialog(pendingDeleteRequest);
      };

    readonly setTitlesHidden = (hidden: boolean): void => {
        gridController.setTitlesHidden(hidden);
        this.refreshToolbarView();
      };

    readonly openZoomForClip = (clip: Clip | null): boolean => {
        if (!clip || this.isFullscreen()) return false;
        const src = gridController.getClipMediaSource(clip.id);
        if (!src) return false;
        gridController.setSelectedClipId(clip.id);
        return zoomOverlay.open({ clipId: clip.id, src, name: clip.name || '' });
      };

    readonly openZoomForClipId = (clipId: string | null | undefined): boolean => {
        return this.openZoomForClip(gridController.getClipById(clipId));
      };

    readonly browseZoomByOffset = (offset: number): boolean => {
        if (!zoomOverlay.isOpen()) return false;
        const currentClipId = zoomOverlay.getCurrentClipId();
        const nextClip = offset > 0
          ? gridController.getNextClip(currentClipId)
          : gridController.getPrevClip(currentClipId);
        if (!nextClip) {
          audioFeedback.playBoundaryClank();
          return false;
        }
        return this.openZoomForClip(nextClip);
      };

    readonly resolveZoomedClipFromActiveSequence = (): Clip | null => {
        const clipId = zoomOverlay.getCurrentClipId();
        if (!clipId) return null;
        return pipelineSession.resolveClip(clipId);
      };

    readonly addCreatedClipInPipelineMode = (createdFile: ClipFile): Clip | null => {
        const result = pipelineSession.insertCreatedClipInPipeline(createdFile);
        if (!result.ok) return null;

        gridController.invalidateView('pipeline');
        this.applySelection(result.sequence, {
          collection: null,
          folderSession: state.currentFolderSession,
        });
        gridController.setSelectedClipId(result.clip.id);
        return result.clip;
      };

    readonly addCreatedClipInCollectionMode = (sourceClipId: string, createdFile: ClipFile): Clip | null => {
        const result = pipelineSession.insertCreatedClipAfter(sourceClipId, createdFile);
        if (!result.ok) return null;
        gridController.invalidateView('pipeline');
        gridController.invalidateView(this.activeGridViewCacheKey());
        gridController.renderCollection(result.sequence, {
          cacheKey: this.activeGridViewCacheKey(),
        });
        this.refreshCollectionSelectorView();
        this.refreshToolbarView();
        gridController.setSelectedClipId(result.clip.id);
        return result.clip;
      };

    readonly applyCreatedVideoEditResult = ({ sourceClip, createdFile }: {
        sourceClip: Clip;
        createdFile: ClipFile;
      }): Clip | null => {
        return this.isPipelineMode()
          ? this.addCreatedClipInPipelineMode(createdFile)
          : this.addCreatedClipInCollectionMode(sourceClip.id, createdFile);
      };

    readonly requestZoomVideoEdit = async (edit: VideoEdit | null | undefined): Promise<void> => {
        const sourceClip = this.resolveZoomedClipFromActiveSequence();
        if (!edit || !sourceClip || !this.currentPipeline()) return;
        try {
          await zoomVideoEditWorkflow.run({
            edit,
            sourceClip,
            folderSession: AppControllerSupport.folderSessionWithPath(state.currentFolderSession),
          });
        } catch (error) {
          const problem = error instanceof VideoEditNotificationError
            ? `${edit.label}: ${error.message}`
            : `${edit.label}: an unexpected application error interrupted editing.`;
          const errors: unknown[] = error instanceof VideoEditNotificationError ? error.errors : [error];
          const technicalDetails = errors.map(cause => cause instanceof Error ? cause.stack ?? cause.message : String(cause)).join('\n\n');
          this.showErrorStatus(problem, {
            affected: `${edit.label}: ${sourceClip.name}`,
            recovery: error instanceof VideoEditNotificationError && error.result?.ok
              ? `Check ${error.result.createdFile.name} in the output folder before running the edit again.`
              : 'Review the error details before trying the edit again.',
            technicalDetails,
          });
          await diagnostics.logRuntimeError(problem, new Error(technicalDetails));
        }
      };

    readonly openZoomEditMenu = (point: ContextMenuPoint): void => {
        if (!zoomOverlay.isOpen() || !this.resolveZoomedClipFromActiveSequence()) return;
        zoomEditMenuControl.open({
          point,
          isDisabled: zoomVideoEditWorkflow.isRunning(),
          onSelectEdit: (edit) => {
            void this.requestZoomVideoEdit(edit);
          },
        });
      };

    readonly openGridContextMenu = (point: ContextMenuPoint): void => {
        const hasSelection = gridController.getSelectedClipIds().length > 0;
        gridContextMenuControl.open({
          point,
          hasSelection,
          hasPipeline: !!this.currentPipeline(),
          targetCollections: AddToCollectionDialogController.buildChoices({
            pipeline: this.currentPipeline(),
            activeCollectionFilename: this.activeCollectionFilename(),
          }),
          onAddToCollection: (choice) => {
            void this.runAddToCollection({
              kind: 'existing',
              collectionFilename: choice.collectionFilename ?? null,
            });
          },
          onNewCollection: () => {
            this.openAddToCollectionDialog({ startWithNewCollection: true });
          },
          onDeleteFromDisk: () => {
            this.openDeleteFromDiskFlow();
          },
        });
      };

    readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
        if (utilities?.isOpen || e.defaultPrevented) return;
        if (shell.activeScreen === collectionScreen) fullscreenSession.onGlobalKeyDown(e);
      };

    readonly onKeyDown = (e: KeyboardEvent): void => {
        if (utilities?.isOpen || e.defaultPrevented) return;
        if (shell.activeScreen === collectionScreen) appKeyDownHandler.handle(e);
      };

    readonly onToggleTitles = (): void => {
        this.setTitlesHidden(!gridController.areTitlesHidden());
      };

    readonly onFsToggle = (): void => {
        if (zoomOverlay.isOpen()) this.closeZoom();
        fullscreenSession.onFsToggle();
      };

    readonly onFsChange = (): void => {
        utilities?.close(false);
        if (this.isFullscreen() && zoomOverlay.isOpen()) this.closeZoom();
        fullscreenSession.onFsChange();
        if (!this.isFullscreen() && this.currentClipSequence()) {
          gridController.renderCollection(this.currentClipSequence(), {
            cacheKey: this.activeGridViewCacheKey(),
          });
        }
      };
  }

  const workflows = new AppWorkflows();
this.initialized = true;
  'use strict';

  const pickBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('pickBtn');
  const saveBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('saveBtn');
  const saveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('saveAsNewBtn');
  const addToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('addToCollectionBtn');
  const deleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('deleteFromDiskBtn');
  const orderMenu = AppControllerSupport.requiredElement('orderMenu');
  const orderMenuBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('orderMenuBtn');
  const orderMenuPanel = AppControllerSupport.requiredElement('orderMenuPanel');
  const grid = AppControllerSupport.requiredElement('grid');
  const gridWrap = AppControllerSupport.requiredElement('gridWrap');
  const countSpan = AppControllerSupport.requiredElement('count');
  const activeCollectionNameEl = AppControllerSupport.requiredElement<HTMLSelectElement>('activeCollectionName');
  const toolbar = AppControllerSupport.requiredElement('toolbar');
  const activityIndicatorRoot = AppControllerSupport.requiredElement('activityIndicatorRoot');
  const activityIndicatorBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('activityIndicatorBtn');
  const activityIndicatorPanel = AppControllerSupport.requiredElement('activityIndicatorPanel');
  const activityIndicatorList = AppControllerSupport.requiredElement<HTMLUListElement>('activityIndicatorList');
  const zoomLayerRoot = AppControllerSupport.requiredElement('zoomLayerRoot');
  const toggleTitlesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('toggleTitlesBtn');
  const fsBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('fsBtn');
  const collectionConflict = AppControllerSupport.requiredElement('collectionConflict');
  const collectionConflictSummary = AppControllerSupport.requiredElement('collectionConflictSummary');
  const collectionConflictList = AppControllerSupport.requiredElement('collectionConflictList');
  const applyCollectionConflictBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('applyCollectionConflictBtn');
  const cancelCollectionConflictBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelCollectionConflictBtn');
  const saveAsNewDialog = AppControllerSupport.requiredElement('saveAsNewDialog');
  const saveAsNewDialogTitle = saveAsNewDialog.querySelector<HTMLElement>('h2');
  const saveAsNewDialogText = saveAsNewDialog.querySelector<HTMLElement>('p');
  const saveAsNewNameInput = AppControllerSupport.requiredElement<HTMLInputElement>('saveAsNewNameInput');
  const saveAsNewError = AppControllerSupport.requiredElement('saveAsNewError');
  const confirmSaveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('confirmSaveAsNewBtn');
  const cancelSaveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelSaveAsNewBtn');
  const addToCollectionDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('addToCollectionDialog');
  const addToCollectionSelect = AppControllerSupport.optionalElement<HTMLSelectElement>('addToCollectionSelect');
  const addToCollectionNameLabel = AppControllerSupport.optionalElement('addToCollectionNameLabel');
  const addToCollectionNameInput = AppControllerSupport.optionalElement<HTMLInputElement>('addToCollectionNameInput');
  const addToCollectionError = AppControllerSupport.optionalElement('addToCollectionError');
  const confirmAddToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmAddToCollectionBtn');
  const cancelAddToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelAddToCollectionBtn');
  const unsavedChangesDialog = AppControllerSupport.requiredElement<HTMLDialogElement>('unsavedChangesDialog');
  const unsavedChangesText = AppControllerSupport.requiredElement('unsavedChangesText');
  const confirmUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('confirmUnsavedChangesBtn');
  const discardUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('discardUnsavedChangesBtn');
  const cancelUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelUnsavedChangesBtn');
  const deletePreflightDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('deletePreflightDialog');
  const deletePreflightText = AppControllerSupport.optionalElement('deletePreflightText');
  const confirmDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmDeletePreflightBtn');
  const discardDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('discardDeletePreflightBtn');
  const cancelDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelDeletePreflightBtn');
  const deleteFromDiskDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('deleteFromDiskDialog');
  const deleteFromDiskSummary = AppControllerSupport.optionalElement('deleteFromDiskSummary');
  const deleteFromDiskPreview = AppControllerSupport.optionalElement('deleteFromDiskPreview');
  const confirmDeleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmDeleteFromDiskBtn');
  const cancelDeleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelDeleteFromDiskBtn');
  const clipContextMenu = AppControllerSupport.requiredElement('clipContextMenu');
  const clipContextMenuPanel = AppControllerSupport.requiredElement('clipContextMenuPanel');
  const body = document.body;

  const state = new AppSessionState();
  const pipelineSession = new PipelineSession();
  const appText = new AppText();
  const displayLayoutRules = new DisplayLayoutRules();
  const collectionNameValidator = new CollectionNameValidator(appText);
  const videoEditCatalog = new VideoEditCatalog();
  const clipLabelFormatter = new ClipLabelFormatter();
  const validator = new CollectionDescriptionValidator();
  const settingsParser = new AppSettingsParser();
  const settingsService = new AppSettingsService(ElectronAppSettingsService.fromWindow(window, settingsParser));
  const zoomOverlay = new ZoomOverlayController({
    mountEl: zoomLayerRoot,
    audioDefault: () => settingsService.current.singleClipAudioDefault,
    onPlaybackFailure: ({ name, error }) => {
      const problem = `Could not play ${name || 'the selected clip'} in Zoom.`;
      workflows.showErrorStatus(problem, {
        affected: name,
        recovery: 'Close and reopen the clip. If playback still fails, check that the file is available and playable.',
        technicalDetails: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      void diagnostics.logRuntimeError(problem, error);
    },
    document,
    onContextMenu: ({ point }) => {
      if (workflows.isFullscreen()) return;
      workflows.openZoomEditMenu(point);
    },
  });
  const fileSystem = new ElectronFileSystemService({ win: window });
  const clipEditor = new ClipEditor({
    runtimeEditingService: fileSystem,
    videoEditCatalog,
  });
  const utilityHost = AppControllerSupport.optionalElement('globalUtilityHost');
  let utilities: GlobalUtilityCoordinator | null = null;
  const activityIndicatorControl = new ActivityIndicatorControl({
    requestPanelClose: () => utilities?.close(),
    writeClipboard: text => navigator.clipboard.writeText(text),
    root: activityIndicatorRoot,
    button: activityIndicatorBtn,
    panel: activityIndicatorPanel,
    listEl: activityIndicatorList,
    document,
    win: window,
    requestPanelOpen: utilityHost ? () => {
      if (workflows.isFullscreen() || zoomOverlay.isOpen() || saveAsNewDialogController.isOpen()
        || collectionConflictController.isVisible() || document.querySelector('dialog[open]')) return;
      utilities?.open('activity');
    } : undefined,
  });
  const loadStatusControl = new LoadStatusControl({ appText, statusControl: activityIndicatorControl });
  const audioFeedback = new AudioFeedbackAdapter({ win: window });
  const clock = new ClockAdapter();
  const fullscreenAdapter = new FullscreenAdapter({ doc: document });
  const pipelineFactory = new PipelineFactory();
  const diagnostics = new AppDiagnostics({
    fileSystem,
    validator,
    errorLogFilename: ERROR_LOG_FILENAME,
    getCurrentFolderSession: () => state.currentFolderSession,
  });
  const clipContextMenuController = new ContextMenuController({
    root: clipContextMenu,
    panel: clipContextMenuPanel,
    document,
  });
  const gridContextMenuControl = new GridContextMenuControl({
    contextMenuController: clipContextMenuController,
  });
  const zoomEditMenuControl = new ZoomEditMenuControl({
    contextMenuController: clipContextMenuController,
    videoEditCatalog,
  });
  const collectionSelectorControl = new CollectionSelectorControl({
    appText,
    selectEl: activeCollectionNameEl,
    doc: document,
    pipelineSelectionValue: PIPELINE_SELECTION_VALUE,
    defaultTitle: appText.defaultAppTitle,
    onSelectionRequested: (selectedCollectionFilename) => {
      const pipeline = workflows.currentPipeline();
      if (!pipeline) {
        workflows.refreshCollectionSelectorView();
        return;
      }
      if ((selectedCollectionFilename || '') === workflows.activeCollectionFilename()) {
        workflows.refreshCollectionSelectorView();
        return;
      }
      if (pipelineSession.hasDirtyClipSequenceChanges) {
        state.setPendingSelectionAction({
          type: 'switch-selection',
          collectionFilename: selectedCollectionFilename,
        });
        workflows.refreshCollectionSelectorView();
        workflows.openUnsavedDialog();
        return;
      }
      void workflows.reloadSelection({
        pipeline,
        collection: selectedCollectionFilename
          ? pipeline.getCollectionByFilename(selectedCollectionFilename)
          : null,
      });
    },
  });
  const mainToolbarControl = new MainToolbarControl({
    appText,
    browseButton: pickBtn,
    fullscreenButton: fsBtn,
    countEl: countSpan,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
    onBrowse: () => void workflows.onPickFolder(),
    onSave: () => void workflows.saveActiveCollection(),
    onSaveAsNew: workflows.openSaveAsNewDialog,
    onAddToCollection: () => workflows.openAddToCollectionDialog(),
    onDeleteFromDisk: workflows.openDeleteFromDiskFlow,
    onToggleTitles: workflows.onToggleTitles,
    onToggleFullscreen: workflows.onFsToggle,
  });
  const addToCollectionDialogController = new AddToCollectionDialogController({
    dialog: addToCollectionDialog,
    destinationSelect: addToCollectionSelect,
    newCollectionNameLabel: addToCollectionNameLabel,
    newCollectionNameInput: addToCollectionNameInput,
    errorMessageEl: addToCollectionError,
    confirmBtn: confirmAddToCollectionBtn,
    cancelBtn: cancelAddToCollectionBtn,
    newChoiceValue: NEW_COLLECTION_CHOICE_VALUE,
    validateNewName: name => collectionNameValidator.validate(name, workflows.currentPipeline()),
    onConfirm: (destination) => {
      void workflows.confirmAddToCollection(destination);
    },
  });
  const collectionConflictController = new CollectionConflictController({
    appText,
    root: collectionConflict,
    summaryEl: collectionConflictSummary,
    listEl: collectionConflictList,
    applyBtn: applyCollectionConflictBtn,
    cancelBtn: cancelCollectionConflictBtn,
  });
  const saveAsNewDialogController = new SaveAsNewDialogController({
    dialog: saveAsNewDialog,
    titleEl: saveAsNewDialogTitle,
    textEl: saveAsNewDialogText,
    nameInput: saveAsNewNameInput,
    errorMessageEl: saveAsNewError,
    confirmBtn: confirmSaveAsNewBtn,
    cancelBtn: cancelSaveAsNewBtn,
    validateName: name => collectionNameValidator.validate(name, workflows.currentPipeline()),
    onConfirm: (name) => {
      void workflows.confirmSaveAsNew(name);
    },
    onCancel: workflows.cancelSaveAsNewFlow,
  });
  const unsavedChangesDialogController = new UnsavedChangesDialogController({
    dialog: unsavedChangesDialog,
    messageEl: unsavedChangesText,
    confirmBtn: confirmUnsavedChangesBtn,
    discardBtn: discardUnsavedChangesBtn,
    cancelBtn: cancelUnsavedChangesBtn,
  });
  const deleteFromDiskDialogController = new DeleteFromDiskDialogController({
    appText,
    preflightDialog: deletePreflightDialog,
    preflightTextEl: deletePreflightText,
    confirmPreflightBtn: confirmDeletePreflightBtn,
    discardPreflightBtn: discardDeletePreflightBtn,
    cancelPreflightBtn: cancelDeletePreflightBtn,
    confirmDialog: deleteFromDiskDialog,
    confirmSummaryEl: deleteFromDiskSummary,
    confirmPreviewEl: deleteFromDiskPreview,
    confirmDeleteBtn: confirmDeleteFromDiskBtn,
    cancelDeleteBtn: cancelDeleteFromDiskBtn,
  });
  let pendingDeleteRequest: DeleteRequest | null = null;





































































































  const zoomVideoEditWorkflow = new ZoomVideoEditWorkflow({
    clipEditor,
    onStarted: ({ edit, sourceClip }) => {
      workflows.refreshToolbarView();
      workflows.showProgressStatus(appText.videoEditStartedText(edit.label, sourceClip.name));
    },
    onCreated: ({ edit, sourceClip, createdFile }) => {
      const rendererFile = fileSystem.toRendererFile(createdFile);
      const nextZoomClip = workflows.applyCreatedVideoEditResult({
        sourceClip,
        createdFile: rendererFile,
      });

      workflows.refreshToolbarView();
      if (!nextZoomClip) {
        if (workflows.isPipelineMode()) {
          workflows.showErrorStatus(`${appText.videoEditSucceededText(rendererFile.name)} The pipeline view could not be refreshed.`);
        } else {
          workflows.showErrorStatus(appText.videoEditPartialSuccessText(rendererFile.name));
        }
        return;
      }

      workflows.openZoomForClip(nextZoomClip);
      workflows.showStatus(appText.videoEditSucceededText(rendererFile.name), 4000);
    },
    onFailed: ({ edit, sourceClip, result }) => {
      workflows.refreshToolbarView();
      workflows.showErrorStatus(appText.videoEditFailedText({
        actionLabel: edit.label,
        code: result?.code,
      }), {
        affected: `${edit.label}: ${sourceClip.name}`,
        recovery: 'Check the source file and output folder before trying the edit again.',
        technicalDetails: `Operation: ${edit.id}\nSource: ${sourceClip.name}\nResult: ${result.code}`,
      });
    },
    onFinished: () => {
      workflows.refreshToolbarView();
    },
  });







  const gridController = new ClipCollectionGridController({
    grid,
    gridRoot: gridWrap,
    toolbar,
    coordinateWorkspaceLayout: true,
    formatLabel: clipLabelFormatter.formatLabel.bind(clipLabelFormatter),
    layoutRules: displayLayoutRules,
    isFullscreen: workflows.isFullscreen,
    updateCount: workflows.refreshToolbarView,
    onMetadataFailure: ({ clip, error }) => {
      void diagnostics.logVideoMetadataFailure({ filename: clip?.name || '', error });
    },
    onSelectionChange: () => {
      workflows.refreshToolbarView();
    },
    onOrderChange: (orderedClipIds) => {
      if (!workflows.currentClipSequence()) return;
      pipelineSession.replaceCurrentOrder(orderedClipIds);
      workflows.refreshCollectionSelectorView();
      workflows.refreshToolbarView();
    },
    onOpenClip: workflows.openZoomForClipId,
    onRemoveSelected: (orderedSelectedClipIds) => {
      if (zoomOverlay.isOpen() || !workflows.currentClipSequence()) return;
      if (workflows.isPipelineMode()) {
        workflows.openDeleteFromDiskFlow();
        return;
      }
      const removedClipIds = pipelineSession.removeFromCurrentSequence(orderedSelectedClipIds);
      if (removedClipIds.length === 0) return;
      gridController.invalidateView(workflows.activeGridViewCacheKey());
      gridController.renderCollection(workflows.currentClipSequence(), {
        cacheKey: workflows.activeGridViewCacheKey(),
      });
      workflows.refreshCollectionSelectorView();
      workflows.refreshToolbarView();
      workflows.showStatus(appText.removedClipsText(removedClipIds.length));
    },
    onContextMenu: ({ point }) => {
      if (zoomOverlay.isOpen() || workflows.isFullscreen()) return;
      workflows.openGridContextMenu(point);
    },
  });

  const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = gridController;

  const fullscreenSession = new FullscreenSession({
    body,
    setFullscreenButtonState: active => mainToolbarControl.setFullscreenButtonState(active),
    isTitlesHidden: () => gridController.areTitlesHidden(),
    setTitlesHidden: workflows.setTitlesHidden,
    enterFullScreenAdapter: fullscreenAdapter.enterFullScreen.bind(fullscreenAdapter),
    exitFullScreenAdapter: fullscreenAdapter.exitFullScreen.bind(fullscreenAdapter),
    isFullscreen: workflows.isFullscreen,
    fsApplySlots,
    rotateVisibleClip: () => gridController.rotateVisibleClip(),
    cancelRotation: () => gridController.cancelRotation(),
    fsRestore,
    computeGrid,
    showStatus: workflows.showStatus,
    layoutRules: displayLayoutRules,
    appText,
    every: clock.every.bind(clock),
    clearClock: clock.clear.bind(clock),
  });
  const appKeyDownHandler = new AppKeyDownHandler({
    saveAsNewDialogController,
    addToCollectionDialogController,
    deleteFromDiskDialogController,
    unsavedChangesDialogController,
    zoomOverlay,
    gridController,
    isFullscreen: workflows.isFullscreen,
    closeZoom: workflows.closeZoom,
    browseZoomByOffset: workflows.browseZoomByOffset,
    openZoomForClipId: workflows.openZoomForClipId,
  });











  new OrderMenuController({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn: null,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
  });

  workflows.clearLoadedState();
  recomputeLayout();
  workflows.setTitlesHidden(false);
  const settingsScreen = new SettingsScreen(settingsService, {
    progress: workflows.showProgressStatus, success: workflows.showStatus, error: workflows.showErrorStatus,
  });
  const keyboardPanel = utilityHost ? AppControllerSupport.requiredElement('keyboardMapPanel') : null;
  const keyboardMap = keyboardPanel ? new KeyboardMapControl(keyboardPanel, GLOBAL_UTILITY_SHORTCUTS, () => utilities?.close()) : null;
  const collectionScreen = new CollectionScreen(AppControllerSupport.requiredElement('collectionScreen'), toolbar, gridController, mainToolbarControl);
  const shell = new ApplicationShellController({
    screenHost: AppControllerSupport.requiredElement('mainScreenHost'),
    commandHost: AppControllerSupport.requiredElement('screenCommandHost'),
    selector: AppControllerSupport.requiredElement<HTMLSelectElement>('appScreenSelector'),
    screens: [collectionScreen, settingsScreen],
    onScreenChange: screen => keyboardMap?.render(screen),
    workspace: AppControllerSupport.optionalElement('workspaceRow') ?? undefined,
    center: AppControllerSupport.optionalElement('centralWorkspace') ?? undefined,
    panels: ['pipelines', 'clips'].flatMap(name => {
      const root = AppControllerSupport.optionalElement(`${name}Panel`);
      if (!root) return [];
      const label = name[0].toUpperCase() + name.slice(1);
      return [{ root, content: AppControllerSupport.requiredElement(`${name}PanelContent`),
        foldButton: AppControllerSupport.requiredElement<HTMLButtonElement>(`fold${label}`),
        revealButton: AppControllerSupport.requiredElement<HTMLButtonElement>(`reveal${label}`) }];
    }),
    onBoundsChange: (screen, width, duration) => {
      if (screen === collectionScreen) gridController.beginWorkspaceResize(width, duration);
    },
    onBoundsSettled: screen => {
      if (screen === collectionScreen) gridController.endWorkspaceResize();
    },
  });
  if (utilityHost && keyboardPanel && keyboardMap) {
    utilities = new GlobalUtilityCoordinator(utilityHost, [
      { id: 'keyboard', label: 'Keyboard shortcuts', trigger: AppControllerSupport.requiredElement<HTMLButtonElement>('keyboardMapBtn'), panel: keyboardPanel, focusInitial: () => keyboardMap.focusInitial() },
      { id: 'activity', label: 'Activity and Errors', trigger: activityIndicatorBtn, panel: activityIndicatorPanel, focusInitial: () => activityIndicatorControl.focusInitial() },
    ]);
  }
  AppControllerSupport.requiredElement<HTMLSelectElement>('appScreenSelector').addEventListener('change', () => {
    if (zoomOverlay.isOpen()) workflows.closeZoom();
  });
  AppControllerSupport.optionalElement<HTMLButtonElement>('settingsBtn')?.addEventListener('click', () => {
    utilities?.close(false);
    if (zoomOverlay.isOpen()) workflows.closeZoom();
    shell.activate(settingsScreen.id);
  });
  const settingsReady = settingsScreen.load();
  const workspaceResize = new ResizeObserver(() => { if (!shell.workspaceMoving) recomputeLayout(); });
  workspaceResize.observe(gridWrap);
  new ApplicationEventController({
    document,
    window,
    onFullscreenChange: workflows.onFsChange,
    onResize: recomputeLayout,
    onKeyDown: workflows.onKeyDown,
    onGlobalKeyDown: workflows.onGlobalKeyDown,
    onPageHide: () => {
      fullscreenSession.destroy();
      gridController.destroy();
      workspaceResize.disconnect();
      shell.destroy();
      utilities?.destroy();
      activityIndicatorControl.destroy();
      collectionSelectorControl.destroy();
      mainToolbarControl.destroy();
    },
  });
  }
}
