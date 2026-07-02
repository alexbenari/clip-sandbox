import { PipelineFactory } from '../business-logic/PipelineFactory.js';
import { createClipEditor } from '../business-logic/clip-editor.js';
import type { AddToCollectionDestination } from '../ui/add-to-collection-dialog-controller.js';
import type { ContextMenuPoint } from '../ui/context-menu-controller.js';
import type { Clip, ClipFile } from '../domain/clip.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Pipeline, RemovedCollectionChange } from '../domain/pipeline.js';
import type { VideoEdit } from '../business-logic/video-edit-catalog.js';
import { createAppState } from './app-session-state.js';
import { createPipelineSession } from './pipeline-session.js';
import { FullscreenAdapter } from '../adapters/browser/fullscreen-adapter.js';
import { ElectronFileSystemService } from '../adapters/electron/electron-file-system-service.js';
import { ClockAdapter } from '../adapters/browser/clock-adapter.js';
import { DomRendererAdapter } from '../adapters/browser/dom-renderer-adapter.js';
import { AudioFeedbackAdapter } from '../adapters/browser/audio-feedback-adapter.js';
import { createFullscreenSession } from './fullscreen-session.js';
import { createAppDiagnostics } from './app-diagnostics.js';
import { createAppKeyDownHandler } from './app-keydown-handler.js';
import { createZoomVideoEditWorkflow } from './zoom-video-edit-workflow.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from './event-binding.js';
import {
  computeBestGrid,
  computeFsLayout,
  normalizeFsSlots,
} from '../ui/display-layout-rules.js';
import {
  fullscreenSlotsText,
  collectionReadErrorText,
  collectionPartiallyLoadedText,
  noCollectionMatchesText,
  savedCollectionFileText,
  removedClipsText,
  addedSelectedClipsText,
  addSelectedClipsFailedText,
  deleteFromDiskPreflightText,
  deleteFromDiskResultText,
  videoEditStartedText,
  videoEditSucceededText,
  videoEditPartialSuccessText,
  videoEditFailedText,
  DEFAULT_APP_TITLE,
} from './app-text.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';
import { AddToCollectionDialogController } from '../ui/add-to-collection-dialog-controller.js';
import { createCollectionSelectorControl } from '../ui/collection-selector-control.js';
import { createMainToolbarControl } from '../ui/main-toolbar-control.js';
import { createActivityIndicatorControl } from '../ui/activity-indicator-control.js';
import { createContextMenuController } from '../ui/context-menu-controller.js';
import { createGridContextMenuControl } from '../ui/grid-context-menu-control.js';
import { createZoomEditMenuControl } from '../ui/zoom-edit-menu-control.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel, updateCardLabel } from '../ui/clip-collection-grid-controller.js';
import { createCollectionConflictController } from '../ui/collection-conflict-controller.js';
import { createDeleteFromDiskDialogController } from '../ui/delete-from-disk-dialog-controller.js';
import { createSaveAsNewDialogController, validateSaveAsNewName } from '../ui/save-as-new-dialog-controller.js';
import { createUnsavedChangesDialogController } from '../ui/unsaved-changes-dialog-controller.js';
import { createLoadStatusControl } from '../ui/load-status-control.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { Collection } from '../domain/collection.js';

let initialized = false;
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

function folderSessionWithPath(folderSession: unknown): { folderPath?: string } | null {
  if (typeof folderSession !== 'object' || folderSession === null) return null;
  const folderPath = (folderSession as { folderPath?: unknown }).folderPath;
  return typeof folderPath === 'string' && folderPath ? { folderPath } : null;
}

function isDeferredSaveResult(result: SaveCollectionResult | null | undefined): result is { deferred: true } {
  return !!result && 'deferred' in result && result.deferred === true;
}

function isSuccessfulSaveResult(result: SaveCollectionResult | null | undefined): result is Extract<SaveClipSequenceResult, { ok: true }> {
  return !!result && 'ok' in result && result.ok === true;
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found.`);
  return element as T;
}

function optionalElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function initApp() {
  if (initialized) return;
  initialized = true;
  'use strict';

  const pickBtn = requiredElement<HTMLButtonElement>('pickBtn');
  const saveBtn = requiredElement<HTMLButtonElement>('saveBtn');
  const saveAsNewBtn = requiredElement<HTMLButtonElement>('saveAsNewBtn');
  const addToCollectionBtn = optionalElement<HTMLButtonElement>('addToCollectionBtn');
  const deleteFromDiskBtn = optionalElement<HTMLButtonElement>('deleteFromDiskBtn');
  const orderMenu = requiredElement('orderMenu');
  const orderMenuBtn = requiredElement<HTMLButtonElement>('orderMenuBtn');
  const orderMenuPanel = requiredElement('orderMenuPanel');
  const grid = requiredElement('grid');
  const gridWrap = requiredElement('gridWrap');
  const countSpan = requiredElement('count');
  const activeCollectionNameEl = requiredElement<HTMLSelectElement>('activeCollectionName');
  const toolbar = requiredElement('toolbar');
  const activityIndicatorRoot = requiredElement('activityIndicatorRoot');
  const activityIndicatorBtn = requiredElement<HTMLButtonElement>('activityIndicatorBtn');
  const activityIndicatorPanel = requiredElement('activityIndicatorPanel');
  const activityIndicatorList = requiredElement<HTMLUListElement>('activityIndicatorList');
  const zoomLayerRoot = requiredElement('zoomLayerRoot');
  const toggleTitlesBtn = requiredElement<HTMLButtonElement>('toggleTitlesBtn');
  const fsBtn = requiredElement<HTMLButtonElement>('fsBtn');
  const collectionConflict = requiredElement('collectionConflict');
  const collectionConflictSummary = requiredElement('collectionConflictSummary');
  const collectionConflictList = requiredElement('collectionConflictList');
  const applyCollectionConflictBtn = requiredElement<HTMLButtonElement>('applyCollectionConflictBtn');
  const cancelCollectionConflictBtn = requiredElement<HTMLButtonElement>('cancelCollectionConflictBtn');
  const saveAsNewDialog = requiredElement('saveAsNewDialog');
  const saveAsNewDialogTitle = saveAsNewDialog.querySelector<HTMLElement>('h2');
  const saveAsNewDialogText = saveAsNewDialog.querySelector<HTMLElement>('p');
  const saveAsNewNameInput = requiredElement<HTMLInputElement>('saveAsNewNameInput');
  const saveAsNewError = requiredElement('saveAsNewError');
  const confirmSaveAsNewBtn = requiredElement<HTMLButtonElement>('confirmSaveAsNewBtn');
  const cancelSaveAsNewBtn = requiredElement<HTMLButtonElement>('cancelSaveAsNewBtn');
  const addToCollectionDialog = optionalElement<HTMLDialogElement>('addToCollectionDialog');
  const addToCollectionSelect = optionalElement<HTMLSelectElement>('addToCollectionSelect');
  const addToCollectionNameLabel = optionalElement('addToCollectionNameLabel');
  const addToCollectionNameInput = optionalElement<HTMLInputElement>('addToCollectionNameInput');
  const addToCollectionError = optionalElement('addToCollectionError');
  const confirmAddToCollectionBtn = optionalElement<HTMLButtonElement>('confirmAddToCollectionBtn');
  const cancelAddToCollectionBtn = optionalElement<HTMLButtonElement>('cancelAddToCollectionBtn');
  const unsavedChangesDialog = requiredElement<HTMLDialogElement>('unsavedChangesDialog');
  const unsavedChangesText = requiredElement('unsavedChangesText');
  const confirmUnsavedChangesBtn = requiredElement<HTMLButtonElement>('confirmUnsavedChangesBtn');
  const discardUnsavedChangesBtn = requiredElement<HTMLButtonElement>('discardUnsavedChangesBtn');
  const cancelUnsavedChangesBtn = requiredElement<HTMLButtonElement>('cancelUnsavedChangesBtn');
  const deletePreflightDialog = optionalElement<HTMLDialogElement>('deletePreflightDialog');
  const deletePreflightText = optionalElement('deletePreflightText');
  const confirmDeletePreflightBtn = optionalElement<HTMLButtonElement>('confirmDeletePreflightBtn');
  const discardDeletePreflightBtn = optionalElement<HTMLButtonElement>('discardDeletePreflightBtn');
  const cancelDeletePreflightBtn = optionalElement<HTMLButtonElement>('cancelDeletePreflightBtn');
  const deleteFromDiskDialog = optionalElement<HTMLDialogElement>('deleteFromDiskDialog');
  const deleteFromDiskSummary = optionalElement('deleteFromDiskSummary');
  const deleteFromDiskPreview = optionalElement('deleteFromDiskPreview');
  const confirmDeleteFromDiskBtn = optionalElement<HTMLButtonElement>('confirmDeleteFromDiskBtn');
  const cancelDeleteFromDiskBtn = optionalElement<HTMLButtonElement>('cancelDeleteFromDiskBtn');
  const clipContextMenu = requiredElement('clipContextMenu');
  const clipContextMenuPanel = requiredElement('clipContextMenuPanel');
  const body = document.body;

  const state = createAppState();
  const pipelineSession = createPipelineSession();
  const fullscreenState = {
    slots: 12,
    hiddenCards: [],
    digitBuffer: '',
    digitTimer: null,
    randInterval: null,
    randPending: false,
    savedTitlesHidden: null,
  };
  const validator = new CollectionDescriptionValidator();
  const zoomOverlay = createZoomOverlayController({
    mountEl: zoomLayerRoot,
    document,
    onContextMenu: ({ point }) => {
      if (isFullscreen()) return;
      openZoomEditMenu(point);
    },
  });
  const fileSystem = new ElectronFileSystemService({ win: window });
  const clipEditor = createClipEditor({
    runtimeEditingService: fileSystem,
  });
  const domRenderer = new DomRendererAdapter();
  const activityIndicatorControl = createActivityIndicatorControl({
    root: activityIndicatorRoot,
    button: activityIndicatorBtn,
    panel: activityIndicatorPanel,
    listEl: activityIndicatorList,
    document,
    win: window,
  });
  const loadStatusControl = createLoadStatusControl({ statusControl: activityIndicatorControl });
  const audioFeedback = new AudioFeedbackAdapter({ win: window });
  const clock = new ClockAdapter();
  const fullscreenAdapter = new FullscreenAdapter({ doc: document });
  const pipelineFactory = new PipelineFactory();
  const diagnostics = createAppDiagnostics({
    fileSystem,
    validator,
    errorLogFilename: ERROR_LOG_FILENAME,
    getCurrentFolderSession: () => state.currentFolderSession,
  });
  const clipContextMenuController = createContextMenuController({
    root: clipContextMenu,
    panel: clipContextMenuPanel,
    document,
  });
  const gridContextMenuControl = createGridContextMenuControl({
    contextMenuController: clipContextMenuController,
  });
  const zoomEditMenuControl = createZoomEditMenuControl({
    contextMenuController: clipContextMenuController,
  });
  const collectionSelectorControl = createCollectionSelectorControl({
    selectEl: activeCollectionNameEl,
    doc: document,
    pipelineSelectionValue: PIPELINE_SELECTION_VALUE,
    defaultTitle: DEFAULT_APP_TITLE,
    onSelectionRequested: (selectedCollectionFilename) => {
      const pipeline = currentPipeline();
      if (!pipeline) {
        refreshCollectionSelectorView();
        return;
      }
      if ((selectedCollectionFilename || '') === activeCollectionFilename()) {
        refreshCollectionSelectorView();
        return;
      }
      if (pipelineSession.hasDirtyClipSequenceChanges) {
        state.setPendingSelectionAction({
          type: 'switch-selection',
          collectionFilename: selectedCollectionFilename,
        });
        refreshCollectionSelectorView();
        openUnsavedDialog();
        return;
      }
      void reloadSelection({
        pipeline,
        collection: selectedCollectionFilename
          ? pipeline.getCollectionByFilename(selectedCollectionFilename)
          : null,
      });
    },
  });
  const mainToolbarControl = createMainToolbarControl({
    countEl: countSpan,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
    activityButton: activityIndicatorBtn,
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
    validateNewName: (name) => AddToCollectionDialogController.validateName({ name, pipeline: currentPipeline() }),
    onConfirm: (destination) => {
      void confirmAddToCollection(destination);
    },
  });
  const collectionConflictController = createCollectionConflictController({
    root: collectionConflict,
    summaryEl: collectionConflictSummary,
    listEl: collectionConflictList,
    applyBtn: applyCollectionConflictBtn,
    cancelBtn: cancelCollectionConflictBtn,
  });
  const saveAsNewDialogController = createSaveAsNewDialogController({
    dialog: saveAsNewDialog,
    titleEl: saveAsNewDialogTitle,
    textEl: saveAsNewDialogText,
    nameInput: saveAsNewNameInput,
    errorMessageEl: saveAsNewError,
    confirmBtn: confirmSaveAsNewBtn,
    cancelBtn: cancelSaveAsNewBtn,
    validateName: (name) => validateSaveAsNewName({ name, pipeline: currentPipeline() }),
    onConfirm: (name) => {
      void confirmSaveAsNew(name);
    },
    onCancel: cancelSaveAsNewFlow,
  });
  const unsavedChangesDialogController = createUnsavedChangesDialogController({
    dialog: unsavedChangesDialog,
    messageEl: unsavedChangesText,
    confirmBtn: confirmUnsavedChangesBtn,
    discardBtn: discardUnsavedChangesBtn,
    cancelBtn: cancelUnsavedChangesBtn,
  });
  const deleteFromDiskDialogController = createDeleteFromDiskDialogController({
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

  function showStatus(msg: string, timeout = 2500): void {
    activityIndicatorControl.show(msg, timeout);
  }

  function showErrorStatus(msg: string): void {
    activityIndicatorControl.showError(msg);
  }

  function showProgressStatus(msg: string): void {
    activityIndicatorControl.showProgress(msg);
  }

  function currentPipeline(): Pipeline | null {
    return pipelineSession.pipeline;
  }

  function activeCollection(): Collection | null {
    return pipelineSession.activeCollection;
  }

  function currentClipSequence(): ClipSequence | null {
    return pipelineSession.currentClipSequence;
  }

  function isPipelineMode(): boolean {
    return pipelineSession.isPipelineMode();
  }

  function activeCollectionFilename(): string {
    return pipelineSession.activeCollectionFilename();
  }

  function gridViewCacheKeyForCollection(collection: Collection | null = activeCollection()): string {
    return collection?.filename ? `collection:${collection.filename}` : 'pipeline';
  }

  function activeGridViewCacheKey(): string {
    return gridViewCacheKeyForCollection(activeCollection());
  }

  function isFullscreen(): boolean {
    return fullscreenAdapter.isFullScreenActive();
  }

  function applyGridLayout(cols: number, cellH: number): void {
    domRenderer.applyGridLayout(gridController?.getGridElement?.() || grid, cols, cellH);
  }

  function refreshCollectionSelectorView() {
    collectionSelectorControl.render({
      pipeline: currentPipeline(),
      activeCollection: activeCollection(),
      currentClipSequence: currentClipSequence(),
    });
  }

  function refreshToolbarView() {
    mainToolbarControl.render({
      clipCount: gridController?.getCardCount?.() ?? grid.children.length,
      hasPipeline: !!currentPipeline(),
      hasSequence: !!currentClipSequence(),
      hasSelection: gridController?.getSelectedClipIds?.().length > 0,
      isPipelineMode: isPipelineMode(),
      titlesHidden: gridController?.areTitlesHidden?.() ?? false,
    });
  }

  function closeZoom() {
    clipContextMenuController.close({ restoreFocus: false });
    zoomOverlay.close();
  }

  function hideCollectionConflict() {
    collectionConflictController.hide();
  }

  function cancelSaveAsNewFlow() {
    saveAsNewDialogController.close();
    if (pendingDeleteRequest?.awaitingSave) {
      pendingDeleteRequest = null;
    }
    state.clearPendingSelectionAction();
    refreshCollectionSelectorView();
  }

  function openSaveAsNewDialog() {
    saveAsNewDialogController.open({ isPipelineMode: isPipelineMode() });
  }

  function openAddToCollectionDialog({ startWithNewCollection = false }: { startWithNewCollection?: boolean } = {}): void {
    if (!currentPipeline()) return;
    addToCollectionDialogController.open({
      choices: AddToCollectionDialogController.buildChoices({
        pipeline: currentPipeline(),
        activeCollectionFilename: activeCollectionFilename(),
      }),
      hasSelection: gridController?.getSelectedClipIds?.().length > 0,
      startWithNewCollection,
    });
  }

  async function runAddToCollection(destination: AddToCollectionDestination, { showDialogValidation = false }: { showDialogValidation?: boolean } = {}) {
    const pipeline = currentPipeline();
    if (!currentClipSequence() || !pipeline) return { ok: false, code: 'missing-context' };
    const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(gridController.getSelectedClipIds());
    if (selectedClipNames.length === 0) return { ok: false, code: 'no-selection' };

    let targetCollectionFilename = '';
    if (destination.kind === 'existing') {
      targetCollectionFilename = String(destination.collectionFilename || '').trim();
    } else if (destination.kind === 'new') {
      const validation = Collection.validateCollectionName(destination.name);
      if (!validation.ok) {
        const validationError = AddToCollectionDialogController.validationErrorText(validation.code);
        if (showDialogValidation && validationError) {
          addToCollectionDialogController.showValidationError(validationError, { focusNameInput: true });
        }
        return { ok: false, code: validation.code };
      }
      if (pipeline.getCollectionByFilename(validation.filename)) {
        const validationError = AddToCollectionDialogController.validationErrorText('already-exists');
        if (showDialogValidation && validationError) {
          addToCollectionDialogController.showValidationError(validationError, { focusNameInput: true });
        }
        return { ok: false, code: 'already-exists' };
      }
      if (validation.filename === activeCollectionFilename()) {
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
        refreshCollectionSelectorView();
        refreshToolbarView();
        showStatus(addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
      }
      return result;
    }

    let result: AddToCollectionResult;
    try {
      const { mode: saveMode } = await persistCollection(mutation.collection);
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
      const validationError = AddToCollectionDialogController.validationErrorText(String(result.code));
      if (showDialogValidation && validationError) {
        addToCollectionDialogController.showValidationError(validationError, {
          focusNameInput: destination.kind === 'new',
        });
        return result;
      }
      if (showDialogValidation) addToCollectionDialogController.close();
      const failureDetail = 'error' in result ? result.error || result.code : result.code;
      showErrorStatus(addSelectedClipsFailedText(result.destinationName || '', failureDetail));
      return result;
    }

    gridController.invalidateView(gridViewCacheKeyForCollection(result.collection));
    addToCollectionDialogController.close();
    refreshCollectionSelectorView();
    refreshToolbarView();
    showStatus(addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
    return result;
  }

  function openUnsavedDialog() {
    const action = state.getPendingSelectionAction();
    unsavedChangesDialogController.open({
      message: action?.type === 'browse-folder'
        ? 'The current view has unsaved changes. Save before browsing to another folder?'
        : 'The current view has unsaved changes. Save before switching views?',
      onSave: () => {
        void continuePendingAction({ saveFirst: true });
      },
      onDiscard: () => {
        void continuePendingAction({ saveFirst: false });
      },
      onCancel: () => {
        state.clearPendingSelectionAction();
        refreshCollectionSelectorView();
      },
    });
  }

  function closeUnsavedDialog() {
    unsavedChangesDialogController.close();
  }

  function buildDeleteRequestFromSelection(): DeleteRequest | null {
    const pipeline = currentPipeline();
    if (!currentClipSequence() || !pipeline) return null;
    const selectedClipIds = gridController.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) return null;
    return {
      selectedClipIds,
      selectedClipNames,
      affectedSavedCollectionCount: pipeline.savedCollectionEntriesContainingClipNames(selectedClipNames).length,
    };
  }

  function openDeletePreflightDialog() {
    deleteFromDiskDialogController.openPreflight({
      text: deleteFromDiskPreflightText(),
      onSave: () => {
        void confirmDeletePreflightSave();
      },
      onDiscard: continueDeleteWithoutSaving,
      onCancel: cancelPendingDeleteFlow,
    });
  }

  function openDeleteFromDiskDialog(deleteRequest: DeleteRequest): void {
    deleteFromDiskDialogController.openConfirmForDeleteRequest(deleteRequest, {
      onConfirm: () => {
        void confirmDeleteFromDisk();
      },
      onCancel: cancelPendingDeleteFlow,
    });
  }

  function cancelPendingDeleteFlow() {
    pendingDeleteRequest = null;
    deleteFromDiskDialogController.closeAll();
  }

  async function confirmDeleteFromDisk(): Promise<void> {
    const deleteRequest = pendingDeleteRequest;
    const pipeline = currentPipeline();
    if (!deleteRequest || !currentClipSequence() || !pipeline) return;
    deleteFromDiskDialogController.closeConfirm();
    pendingDeleteRequest = null;

    const deleteResult = await fileSystem.deleteFiles({
      folderSession: state.currentFolderSession,
      filenames: deleteRequest.selectedClipNames,
    });
    if (deleteResult.code === 'unavailable') {
      showErrorStatus(deleteFromDiskResultText({
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
        await persistCollection(entry.collection);
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
      await reloadSelection({
        pipeline: currentPipeline(),
        collection: activeCollection(),
        folderSession: state.currentFolderSession,
      });
    } else {
      refreshToolbarView();
    }

    if (result.failedDeletes.length > 0 || result.failedCollectionRewrites.length > 0) {
      await diagnostics.logDeleteFailures(result);
    }

    const deleteStatusText = deleteFromDiskResultText({
      deletedCount: result.deletedClipIds.length,
      failedDeleteCount: result.failedDeletes.length,
      cleanedSavedCollectionCount: result.cleanedSavedCollectionCount,
      failedCollectionRewriteCount: result.failedCollectionRewrites.length,
    });
    if (result.failedDeletes.length > 0 || result.failedCollectionRewrites.length > 0 || result.deletedClipIds.length === 0) {
      showErrorStatus(deleteStatusText);
      return;
    }
    showStatus(deleteStatusText, 4500);
  }

  function openDeleteFromDiskFlow() {
    const deleteRequest = buildDeleteRequestFromSelection();
    if (!deleteRequest) return;
    pendingDeleteRequest = deleteRequest;
    if (pipelineSession.hasDirtyClipSequenceChanges) {
      openDeletePreflightDialog();
      return;
    }
    openDeleteFromDiskDialog(deleteRequest);
  }

  function applySelection(clipSequence: ClipSequence, {
    collection = activeCollection(),
    folderSession = state.currentFolderSession,
    statusText = '',
    timeout = 2500,
  }: {
    collection?: Collection | null;
    folderSession?: unknown;
    statusText?: string;
    timeout?: number;
  } = {}): void {
    hideCollectionConflict();
    clipContextMenuController.close({ restoreFocus: false });
    addToCollectionDialogController.close();
    state.setCurrentFolderSession(folderSession || null);
    pipelineSession.activateSelection({ collection, sequence: clipSequence });
    gridController.renderCollection(clipSequence, {
      cacheKey: gridViewCacheKeyForCollection(collection),
    });
    refreshCollectionSelectorView();
    refreshToolbarView();
    if (statusText) showStatus(statusText, timeout);
  }

  function clearLoadedState() {
    hideCollectionConflict();
    pendingDeleteRequest = null;
    saveAsNewDialogController.close();
    addToCollectionDialogController.close();
    deleteFromDiskDialogController.closeAll();
    clipContextMenuController.close({ restoreFocus: false });
    closeUnsavedDialog();
    closeZoom();
    gridController.destroy();
    pipelineSession.reset();
    state.clearPendingSelectionAction();
    state.setCurrentFolderSession(null);
    refreshCollectionSelectorView();
    refreshToolbarView();
  }

  function queueMissingConflict(
    conflict: Parameters<typeof collectionConflictController.showConflict>[0],
    handlers: Parameters<typeof collectionConflictController.showConflict>[1]
  ): void {
    collectionConflictController.showConflict(conflict, handlers);
  }

  async function reloadSelection({
    pipeline = currentPipeline(),
    collection = activeCollection(),
    folderSession = state.currentFolderSession,
  }: {
    pipeline?: Pipeline | null;
    collection?: Collection | null;
    folderSession?: unknown;
  } = {}): Promise<void> {
    if (!pipeline) return;
    const loaded = pipelineSession.materializeSelection(collection);
    if (!loaded) return;
    const { selection, materialization: result } = loaded;
    if (result.kind === 'has-missing') {
      queueMissingConflict(result, {
        onApply: () => {
          if (result.existingNamesInOrder.length === 0) {
            refreshCollectionSelectorView();
            showStatus(noCollectionMatchesText(result.missingCount), 4500);
            return;
          }
          gridController.invalidateView(gridViewCacheKeyForCollection(collection));
          applySelection(result.partialSequence, {
            collection,
            folderSession,
            statusText: collectionPartiallyLoadedText(result.existingNamesInOrder.length, result.missingCount),
            timeout: 4000,
          });
        },
        onCancel: () => {
          refreshCollectionSelectorView();
        },
      });
      return;
    }

    applySelection(result.sequence, {
      collection: selection instanceof Collection ? selection : null,
      folderSession,
    });
    loadStatusControl.showSelectionLoadStatus({
      isPipelineMode: selection === pipeline,
      clipCount: result.sequence.orderedClips().length,
    });
  }

  async function loadPipeline({ folderSession = null, files = [], folderName = '' }: Partial<FolderSelection> = {}): Promise<void> {
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
      applySelection(result.sequence, {
        collection: null,
        folderSession,
      });
      loadStatusControl.showInitialLoadStatus({
        pipeline,
        clipCount: result.sequence.orderedClips().length,
      });
    } catch (err) {
      await diagnostics.logRuntimeError('Failed to load the selected folder.', err, folderSession);
      showErrorStatus(collectionReadErrorText(err));
    }
  }

  async function triggerFolderPicker(): Promise<void> {
    hideCollectionConflict();
    try {
      const selection = await fileSystem.pickFolder({
        onFileReadError: (info, folderSession) => {
          void diagnostics.logDirectoryReadError(
            info as Parameters<typeof diagnostics.logDirectoryReadError>[0],
            folderSession
          );
        },
      });
      await loadPipeline(selection);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await diagnostics.logRuntimeError('Failed to browse for a folder.', err, state.currentFolderSession);
      showErrorStatus(collectionReadErrorText(err));
    }
  }

  async function onPickFolder(): Promise<void> {
    if (pipelineSession.hasDirtyClipSequenceChanges) {
      state.setPendingSelectionAction({ type: 'browse-folder' });
      refreshCollectionSelectorView();
      openUnsavedDialog();
      return;
    }
    await triggerFolderPicker();
  }

  async function continuePendingAction({ saveFirst }: { saveFirst: boolean }): Promise<void> {
    const nextPendingAction = state.getPendingSelectionAction();
    if (!nextPendingAction) {
      closeUnsavedDialog();
      refreshCollectionSelectorView();
      return;
    }
    if (saveFirst) {
      const saveResult = await saveActiveCollection();
      if (isDeferredSaveResult(saveResult)) return;
      if (!isSuccessfulSaveResult(saveResult)) {
        openUnsavedDialog();
        return;
      }
    }
    closeUnsavedDialog();
    state.clearPendingSelectionAction();
    if (nextPendingAction.type === 'browse-folder') {
      await triggerFolderPicker();
      return;
    }
    if (nextPendingAction.type === 'switch-selection') {
      if (!saveFirst) {
        gridController.invalidateView(activeGridViewCacheKey());
        gridController.retagActiveView(null);
      }
      await reloadSelection({
        pipeline: currentPipeline(),
        collection: nextPendingAction.collectionFilename
          ? currentPipeline()?.getCollectionByFilename(nextPendingAction.collectionFilename)
          : null,
      });
      return;
    }
    refreshCollectionSelectorView();
  }

  async function persistCollection(collection: Collection): Promise<PersistCollectionResult> {
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
  }

  async function saveClipSequenceAsCollection(filename: string): Promise<SaveClipSequenceResult> {
    const pipeline = currentPipeline();
    if (!currentClipSequence() || !pipeline) {
      return { ok: false, code: 'missing-context' };
    }
    const collection = pipelineSession.collectionFromCurrentSequence(filename);
    if (!collection) return { ok: false, code: 'missing-context' };
    try {
      const { mode } = await persistCollection(collection);
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
  }

  async function saveActiveCollection(): Promise<SaveCollectionResult | null> {
    if (!currentClipSequence() || !currentPipeline()) return null;
    if (isPipelineMode()) {
      openSaveAsNewDialog();
      return { deferred: true };
    }
    const saveResult = await saveClipSequenceAsCollection(activeCollectionFilename());
    if (!saveResult?.ok) return saveResult;
    const savedCollection = saveResult.collection;
    pipelineSession.markCurrentSequenceSavedAs(savedCollection);
    refreshCollectionSelectorView();
    refreshToolbarView();
    showStatus(savedCollectionFileText(savedCollection.filename || ''));
    return saveResult;
  }

  async function confirmSaveAsNew(rawName: string): Promise<SaveCollectionResult | undefined> {
    const validationError = validateSaveAsNewName({
      name: rawName,
      pipeline: currentPipeline(),
    });
    if (validationError) {
      saveAsNewDialogController.showValidationError(validationError, { focusInput: true });
      return;
    }
    const filename = Collection.filenameFromCollectionName(rawName);
    const saveResult = await saveClipSequenceAsCollection(filename);
    if (!saveResult?.ok) return saveResult;
    const savedCollection = saveResult.collection;
    const previousCacheKey = activeGridViewCacheKey();
    pipelineSession.markCurrentSequenceSavedAs(savedCollection);
    gridController.invalidateView(previousCacheKey);
    gridController.retagActiveView(activeGridViewCacheKey());
    saveAsNewDialogController.close();
    refreshCollectionSelectorView();
    refreshToolbarView();
    showStatus(savedCollectionFileText(filename));
    if (pendingDeleteRequest?.awaitingSave) {
      pendingDeleteRequest.awaitingSave = false;
      openDeleteFromDiskDialog(pendingDeleteRequest);
      return;
    }
    if (state.getPendingSelectionAction()) {
      await continuePendingAction({ saveFirst: false });
    }
    return saveResult;
  }

  async function confirmAddToCollection(destination: AddToCollectionDestination): Promise<void> {
    if (!currentClipSequence() || !currentPipeline()) return;
    await runAddToCollection(destination, { showDialogValidation: true });
  }

  async function confirmDeletePreflightSave(): Promise<void> {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    pendingDeleteRequest.awaitingSave = true;
    const saveResult = await saveActiveCollection();
    if (isDeferredSaveResult(saveResult)) return;
    pendingDeleteRequest.awaitingSave = false;
    if (!isSuccessfulSaveResult(saveResult)) {
      openDeletePreflightDialog();
      return;
    }
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function continueDeleteWithoutSaving(): void {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function setTitlesHidden(hidden: boolean): void {
    gridController.setTitlesHidden(hidden);
    refreshToolbarView();
  }

  function openZoomForClip(clip: Clip | null): boolean {
    if (!clip || isFullscreen()) return false;
    const src = gridController.getClipMediaSource(clip.id);
    if (!src) return false;
    gridController.setSelectedClipId(clip.id);
    return zoomOverlay.open({ clipId: clip.id, src, name: clip.name || '' });
  }

  function openZoomForClipId(clipId: string | null | undefined): boolean {
    return openZoomForClip(gridController.getClipById(clipId));
  }

  function browseZoomByOffset(offset: number): boolean {
    if (!zoomOverlay.isOpen()) return false;
    const currentClipId = zoomOverlay.getCurrentClipId();
    const nextClip = offset > 0
      ? gridController.getNextClip(currentClipId)
      : gridController.getPrevClip(currentClipId);
    if (!nextClip) {
      audioFeedback.playBoundaryClank();
      return false;
    }
    return openZoomForClip(nextClip);
  }

  function resolveZoomedClipFromActiveSequence(): Clip | null {
    const clipId = zoomOverlay.getCurrentClipId();
    if (!clipId) return null;
    return pipelineSession.resolveClip(clipId);
  }

  function addCreatedClipInPipelineMode(createdFile: ClipFile): Clip | null {
    const result = pipelineSession.insertCreatedClipInPipeline(createdFile);
    if (!result.ok) return null;

    gridController.invalidateView('pipeline');
    applySelection(result.sequence, {
      collection: null,
      folderSession: state.currentFolderSession,
    });
    gridController.setSelectedClipId(result.clip.id);
    return result.clip;
  }

  function addCreatedClipInCollectionMode(sourceClipId: string, createdFile: ClipFile): Clip | null {
    const result = pipelineSession.insertCreatedClipAfter(sourceClipId, createdFile);
    if (!result.ok) return null;
    gridController.invalidateView('pipeline');
    gridController.invalidateView(activeGridViewCacheKey());
    gridController.renderCollection(result.sequence, {
      cacheKey: activeGridViewCacheKey(),
    });
    refreshCollectionSelectorView();
    refreshToolbarView();
    gridController.setSelectedClipId(result.clip.id);
    return result.clip;
  }

  function applyCreatedVideoEditResult({ sourceClip, createdFile }: {
    sourceClip: Clip;
    createdFile: ClipFile;
  }): Clip | null {
    return isPipelineMode()
      ? addCreatedClipInPipelineMode(createdFile)
      : addCreatedClipInCollectionMode(sourceClip.id, createdFile);
  }

  const zoomVideoEditWorkflow = createZoomVideoEditWorkflow({
    clipEditor,
    onStarted: ({ edit, sourceClip }) => {
      refreshToolbarView();
      showProgressStatus(videoEditStartedText(edit.label, sourceClip.name));
    },
    onCreated: ({ edit, sourceClip, createdFile }) => {
      const rendererFile = fileSystem.toRendererFile(createdFile);
      const nextZoomClip = applyCreatedVideoEditResult({
        sourceClip,
        createdFile: rendererFile,
      });

      refreshToolbarView();
      if (!nextZoomClip) {
        if (isPipelineMode()) {
          showErrorStatus(`${videoEditSucceededText(rendererFile.name)} The pipeline view could not be refreshed.`);
        } else {
          showErrorStatus(videoEditPartialSuccessText(rendererFile.name));
        }
        return;
      }

      openZoomForClip(nextZoomClip);
      showStatus(videoEditSucceededText(rendererFile.name), 4000);
    },
    onFailed: ({ edit, result }) => {
      refreshToolbarView();
      showErrorStatus(videoEditFailedText({
        actionLabel: edit.label,
        code: result?.code,
      }));
    },
    onFinished: () => {
      refreshToolbarView();
    },
  });

  async function requestZoomVideoEdit(edit: VideoEdit | null | undefined): Promise<void> {
    const sourceClip = resolveZoomedClipFromActiveSequence();
    if (!edit || !sourceClip || !currentPipeline()) return;
    await zoomVideoEditWorkflow.run({
      edit,
      sourceClip,
      folderSession: folderSessionWithPath(state.currentFolderSession),
    });
  }

  function openZoomEditMenu(point: ContextMenuPoint): void {
    if (!zoomOverlay.isOpen() || !resolveZoomedClipFromActiveSequence()) return;
    zoomEditMenuControl.open({
      point,
      isDisabled: zoomVideoEditWorkflow.isRunning(),
      onSelectEdit: (edit) => {
        void requestZoomVideoEdit(edit);
      },
    });
  }

  function openGridContextMenu(point: ContextMenuPoint): void {
    const hasSelection = gridController.getSelectedClipIds().length > 0;
    gridContextMenuControl.open({
      point,
      hasSelection,
      hasPipeline: !!currentPipeline(),
      targetCollections: AddToCollectionDialogController.buildChoices({
        pipeline: currentPipeline(),
        activeCollectionFilename: activeCollectionFilename(),
      }),
      onAddToCollection: (choice) => {
        void runAddToCollection({
          kind: 'existing',
          collectionFilename: choice.collectionFilename ?? null,
        });
      },
      onNewCollection: () => {
        openAddToCollectionDialog({ startWithNewCollection: true });
      },
      onDeleteFromDisk: () => {
        openDeleteFromDiskFlow();
      },
    });
  }

  const gridController = createClipCollectionGridController({
    grid,
    gridRoot: gridWrap,
    toolbar,
    fullscreenState,
    formatLabel,
    computeBestGrid,
    computeFsLayout,
    applyGridLayout,
    isFullscreen,
    updateCount: refreshToolbarView,
    onMetadataFailure: ({ clip, error }) => {
      void diagnostics.logVideoMetadataFailure({ filename: clip?.name || '', error });
    },
    onSelectionChange: () => {
      refreshToolbarView();
    },
    onOrderChange: (orderedClipIds) => {
      if (!currentClipSequence()) return;
      pipelineSession.replaceCurrentOrder(orderedClipIds);
      refreshCollectionSelectorView();
      refreshToolbarView();
    },
    onOpenClip: openZoomForClipId,
    onRemoveSelected: (orderedSelectedClipIds) => {
      if (zoomOverlay.isOpen() || !currentClipSequence()) return;
      if (isPipelineMode()) {
        openDeleteFromDiskFlow();
        return;
      }
      const removedClipIds = pipelineSession.removeFromCurrentSequence(orderedSelectedClipIds);
      if (removedClipIds.length === 0) return;
      gridController.invalidateView(activeGridViewCacheKey());
      gridController.renderCollection(currentClipSequence(), {
        cacheKey: activeGridViewCacheKey(),
      });
      refreshCollectionSelectorView();
      refreshToolbarView();
      showStatus(removedClipsText(removedClipIds.length));
    },
    onContextMenu: ({ point }) => {
      if (zoomOverlay.isOpen() || isFullscreen()) return;
      openGridContextMenu(point);
    },
  });

  const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = gridController;

  const fullscreenSession = createFullscreenSession({
    fullscreenState,
    grid,
    getGrid: () => gridController.getGridElement(),
    body,
    fsBtn,
    isTitlesHidden: () => gridController.areTitlesHidden(),
    setTitlesHidden,
    enterFullScreenAdapter: fullscreenAdapter.enterFullScreen.bind(fullscreenAdapter),
    exitFullScreenAdapter: fullscreenAdapter.exitFullScreen.bind(fullscreenAdapter),
    isFullscreen,
    fsApplySlots,
    fsRestore,
    computeGrid,
    showStatus,
    normalizeFsSlots,
    fullscreenSlotsText,
    every: clock.every.bind(clock),
    clearClock: clock.clear.bind(clock),
    updateCardLabel,
    formatLabel,
  });
  const handleAppKeyDown = createAppKeyDownHandler({
    saveAsNewDialogController,
    addToCollectionDialogController,
    deleteFromDiskDialogController,
    unsavedChangesDialogController,
    zoomOverlay,
    gridController,
    isEditableTarget,
    isFullscreen,
    closeZoom,
    browseZoomByOffset,
    openZoomForClipId,
  });

  function onGlobalKeyDown(e: KeyboardEvent): void {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e: KeyboardEvent): void {
    handleAppKeyDown(e);
  }

  function onToggleTitles(): void {
    setTitlesHidden(!gridController.areTitlesHidden());
  }

  function onFsToggle(): void {
    if (zoomOverlay.isOpen()) closeZoom();
    fullscreenSession.onFsToggle();
  }

  function onFsChange(): void {
    if (isFullscreen() && zoomOverlay.isOpen()) closeZoom();
    fullscreenSession.onFsChange();
    if (!isFullscreen() && currentClipSequence()) {
      gridController.renderCollection(currentClipSequence(), {
        cacheKey: activeGridViewCacheKey(),
      });
    }
  }

  createOrderMenuController({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn: null,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
  });

  bindControlEvents({
    pickBtn,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    loadOrderBtn: null,
    orderFileInput: null,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void onPickFolder(),
    onSaveOrder: () => void saveActiveCollection(),
    onSaveAsNew: openSaveAsNewDialog,
    onAddToCollection: () => openAddToCollectionDialog(),
    onDeleteFromDisk: openDeleteFromDiskFlow,
    onLoadOrderClick: () => {},
    onOrderFileChange: () => {},
    onToggleTitles,
    onFsToggle,
  });

  bindGlobalEvents({
    onFsChange,
    onResize: () => {
      recomputeLayout();
    },
    onKeyDown,
    onGlobalKeyDown,
  });

  clearLoadedState();
  recomputeLayout();
  setTitlesHidden(false);
}

