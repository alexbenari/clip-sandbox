// @ts-nocheck
import { PipelineFactory } from '../business-logic/PipelineFactory.js';
import { createClipEditor } from '../business-logic/clip-editor.js';
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

export function initApp() {
  if (initialized) return;
  initialized = true;
  'use strict';

  const pickBtn = document.getElementById('pickBtn');
  const saveBtn = document.getElementById('saveBtn');
  const saveAsNewBtn = document.getElementById('saveAsNewBtn');
  const addToCollectionBtn = document.getElementById('addToCollectionBtn');
  const deleteFromDiskBtn = document.getElementById('deleteFromDiskBtn');
  const orderMenu = document.getElementById('orderMenu');
  const orderMenuBtn = document.getElementById('orderMenuBtn');
  const orderMenuPanel = document.getElementById('orderMenuPanel');
  const grid = document.getElementById('grid');
  const gridWrap = document.getElementById('gridWrap');
  const countSpan = document.getElementById('count');
  const activeCollectionNameEl = document.getElementById('activeCollectionName');
  const toolbar = document.getElementById('toolbar');
  const activityIndicatorRoot = document.getElementById('activityIndicatorRoot');
  const activityIndicatorBtn = document.getElementById('activityIndicatorBtn');
  const activityIndicatorPanel = document.getElementById('activityIndicatorPanel');
  const activityIndicatorList = document.getElementById('activityIndicatorList');
  const zoomLayerRoot = document.getElementById('zoomLayerRoot');
  const toggleTitlesBtn = document.getElementById('toggleTitlesBtn');
  const fsBtn = document.getElementById('fsBtn');
  const collectionConflict = document.getElementById('collectionConflict');
  const collectionConflictSummary = document.getElementById('collectionConflictSummary');
  const collectionConflictList = document.getElementById('collectionConflictList');
  const applyCollectionConflictBtn = document.getElementById('applyCollectionConflictBtn');
  const cancelCollectionConflictBtn = document.getElementById('cancelCollectionConflictBtn');
  const saveAsNewDialog = document.getElementById('saveAsNewDialog');
  const saveAsNewDialogTitle = saveAsNewDialog?.querySelector('h2');
  const saveAsNewDialogText = saveAsNewDialog?.querySelector('p');
  const saveAsNewNameInput = document.getElementById('saveAsNewNameInput');
  const saveAsNewError = document.getElementById('saveAsNewError');
  const confirmSaveAsNewBtn = document.getElementById('confirmSaveAsNewBtn');
  const cancelSaveAsNewBtn = document.getElementById('cancelSaveAsNewBtn');
  const addToCollectionDialog = document.getElementById('addToCollectionDialog');
  const addToCollectionSelect = document.getElementById('addToCollectionSelect');
  const addToCollectionNameLabel = document.getElementById('addToCollectionNameLabel');
  const addToCollectionNameInput = document.getElementById('addToCollectionNameInput');
  const addToCollectionError = document.getElementById('addToCollectionError');
  const confirmAddToCollectionBtn = document.getElementById('confirmAddToCollectionBtn');
  const cancelAddToCollectionBtn = document.getElementById('cancelAddToCollectionBtn');
  const unsavedChangesDialog = document.getElementById('unsavedChangesDialog');
  const unsavedChangesText = document.getElementById('unsavedChangesText');
  const confirmUnsavedChangesBtn = document.getElementById('confirmUnsavedChangesBtn');
  const discardUnsavedChangesBtn = document.getElementById('discardUnsavedChangesBtn');
  const cancelUnsavedChangesBtn = document.getElementById('cancelUnsavedChangesBtn');
  const deletePreflightDialog = document.getElementById('deletePreflightDialog');
  const deletePreflightText = document.getElementById('deletePreflightText');
  const confirmDeletePreflightBtn = document.getElementById('confirmDeletePreflightBtn');
  const discardDeletePreflightBtn = document.getElementById('discardDeletePreflightBtn');
  const cancelDeletePreflightBtn = document.getElementById('cancelDeletePreflightBtn');
  const deleteFromDiskDialog = document.getElementById('deleteFromDiskDialog');
  const deleteFromDiskSummary = document.getElementById('deleteFromDiskSummary');
  const deleteFromDiskPreview = document.getElementById('deleteFromDiskPreview');
  const confirmDeleteFromDiskBtn = document.getElementById('confirmDeleteFromDiskBtn');
  const cancelDeleteFromDiskBtn = document.getElementById('cancelDeleteFromDiskBtn');
  const clipContextMenu = document.getElementById('clipContextMenu');
  const clipContextMenuPanel = document.getElementById('clipContextMenuPanel');
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
      if (!currentPipeline()) {
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
        pipeline: currentPipeline(),
        collection: selectedCollectionFilename
          ? currentPipeline().getCollectionByFilename(selectedCollectionFilename)
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
  let pendingDeleteRequest = null;

  function showStatus(msg, timeout = 2500) {
    activityIndicatorControl.show(msg, timeout);
  }

  function showErrorStatus(msg) {
    activityIndicatorControl.showError(msg);
  }

  function showProgressStatus(msg) {
    activityIndicatorControl.showProgress(msg);
  }

  function currentPipeline() {
    return pipelineSession.pipeline;
  }

  function activeCollection() {
    return pipelineSession.activeCollection;
  }

  function currentClipSequence() {
    return pipelineSession.currentClipSequence;
  }

  function isPipelineMode() {
    return pipelineSession.isPipelineMode();
  }

  function activeCollectionFilename() {
    return pipelineSession.activeCollectionFilename();
  }

  function gridViewCacheKeyForCollection(collection = activeCollection()) {
    return collection?.filename ? `collection:${collection.filename}` : 'pipeline';
  }

  function activeGridViewCacheKey() {
    return gridViewCacheKeyForCollection(activeCollection());
  }

  function isFullscreen() {
    return fullscreenAdapter.isFullScreenActive();
  }

  function applyGridLayout(cols, cellH) {
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

  function openAddToCollectionDialog({ startWithNewCollection = false } = {}) {
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

  async function runAddToCollection(destination, { showDialogValidation = false } = {}) {
    if (!currentClipSequence() || !currentPipeline()) return { ok: false, code: 'missing-context' };
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
      if (currentPipeline().getCollectionByFilename(validation.filename)) {
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

    const pipeline = currentPipeline();
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

    let result = null;
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
      const validationError = AddToCollectionDialogController.validationErrorText(result.code);
      if (showDialogValidation && validationError) {
        addToCollectionDialogController.showValidationError(validationError, {
          focusNameInput: destination.kind === 'new',
        });
        return result;
      }
      if (showDialogValidation) addToCollectionDialogController.close();
      showErrorStatus(addSelectedClipsFailedText(result.destinationName, result.error || result.code));
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

  function buildDeleteRequestFromSelection() {
    if (!currentClipSequence() || !currentPipeline()) return null;
    const selectedClipIds = gridController.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = pipelineSession.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) return null;
    return {
      selectedClipIds,
      selectedClipNames,
      affectedSavedCollectionCount: currentPipeline().savedCollectionEntriesContainingClipNames(selectedClipNames).length,
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

  function openDeleteFromDiskDialog(deleteRequest) {
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

  async function confirmDeleteFromDisk() {
    const deleteRequest = pendingDeleteRequest;
    if (!deleteRequest || !currentClipSequence() || !currentPipeline()) return;
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

    let changedCollections = [];
    if (deletedClipNames.length > 0) {
      changedCollections = currentPipeline().removeVideos(deletedClipNames).changedCollections;
    }

    const failedCollectionRewrites = [];
    let cleanedSavedCollectionCount = 0;
    for (const entry of changedCollections) {
      try {
        await persistCollection(entry.collection);
        cleanedSavedCollectionCount += 1;
      } catch (error) {
        currentPipeline().upsertCollection(entry.previousCollection);
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

  function applySelection(clipSequence, {
    collection = activeCollection(),
    folderSession = state.currentFolderSession,
    statusText = '',
    timeout = 2500,
  } = {}) {
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

  function queueMissingConflict(conflict, handlers) {
    collectionConflictController.showConflict(conflict, handlers);
  }

  async function reloadSelection({ pipeline = currentPipeline(), collection = activeCollection(), folderSession = state.currentFolderSession } = {}) {
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
      collection: selection === pipeline ? null : selection,
      folderSession,
    });
    loadStatusControl.showSelectionLoadStatus({
      isPipelineMode: selection === pipeline,
      clipCount: result.sequence.orderedClips().length,
    });
  }

  async function loadPipeline({ folderSession = null, files = [], folderName = '' } = {}) {
    try {
      const buildResult = await pipelineFactory.buildPipeline({
        folderName,
        files,
        validator,
        logInvalidDescription: (result) => diagnostics.logInvalidDescription(result, folderSession),
      });
      const { pipeline } = buildResult;
      const result = pipelineSession.loadPipeline(pipeline);

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

  async function triggerFolderPicker() {
    hideCollectionConflict();
    try {
      const selection = await fileSystem.pickFolder({
        onFileReadError: (info, folderSession) => diagnostics.logDirectoryReadError(info, folderSession),
      });
      await loadPipeline(selection);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      await diagnostics.logRuntimeError('Failed to browse for a folder.', err, state.currentFolderSession);
      showErrorStatus(collectionReadErrorText(err));
    }
  }

  async function onPickFolder() {
    if (pipelineSession.hasDirtyClipSequenceChanges) {
      state.setPendingSelectionAction({ type: 'browse-folder' });
      refreshCollectionSelectorView();
      openUnsavedDialog();
      return;
    }
    await triggerFolderPicker();
  }

  async function continuePendingAction({ saveFirst }) {
    const nextPendingAction = state.getPendingSelectionAction();
    closeUnsavedDialog();
    if (!nextPendingAction) {
      refreshCollectionSelectorView();
      return;
    }
    if (saveFirst) {
      const saveResult = await saveActiveCollection();
      if (saveResult?.deferred) return;
    }
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

  async function persistCollection(collection) {
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

  async function saveClipSequenceAsCollection(filename) {
    if (!currentClipSequence() || !currentPipeline()) {
      return { ok: false, code: 'missing-context' };
    }
    const collection = pipelineSession.collectionFromCurrentSequence(filename);
    try {
      const { mode } = await persistCollection(collection);
      currentPipeline().upsertCollection(collection);
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

  async function saveActiveCollection() {
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
    showStatus(savedCollectionFileText(savedCollection.filename));
    return saveResult;
  }

  async function confirmSaveAsNew(rawName) {
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

  async function confirmAddToCollection(destination) {
    if (!currentClipSequence() || !currentPipeline()) return;
    await runAddToCollection(destination, { showDialogValidation: true });
  }

  async function confirmDeletePreflightSave() {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    pendingDeleteRequest.awaitingSave = true;
    const saveResult = await saveActiveCollection();
    if (saveResult?.deferred) return;
    pendingDeleteRequest.awaitingSave = false;
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function continueDeleteWithoutSaving() {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function setTitlesHidden(hidden) {
    gridController.setTitlesHidden(hidden);
    refreshToolbarView();
  }

  function openZoomForClip(clip) {
    if (!clip || isFullscreen()) return false;
    const src = gridController.getClipMediaSource(clip.id);
    if (!src) return false;
    gridController.setSelectedClipId(clip.id);
    return zoomOverlay.open({ clipId: clip.id, src, name: clip.name || '' });
  }

  function openZoomForClipId(clipId) {
    return openZoomForClip(gridController.getClipById(clipId));
  }

  function browseZoomByOffset(offset) {
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

  function resolveZoomedClipFromActiveSequence() {
    const clipId = zoomOverlay.getCurrentClipId();
    if (!clipId) return null;
    return pipelineSession.resolveClip(clipId);
  }

  function addCreatedClipInPipelineMode(createdFile) {
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

  function addCreatedClipInCollectionMode(sourceClipId, createdFile) {
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

  function applyCreatedVideoEditResult({ sourceClip, createdFile }) {
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

  async function requestZoomVideoEdit(edit) {
    const sourceClip = resolveZoomedClipFromActiveSequence();
    if (!edit || !sourceClip || !currentPipeline()) return;
    await zoomVideoEditWorkflow.run({
      edit,
      sourceClip,
      folderSession: state.currentFolderSession,
    });
  }

  function openZoomEditMenu(point) {
    if (!zoomOverlay.isOpen() || !resolveZoomedClipFromActiveSequence()) return;
    zoomEditMenuControl.open({
      point,
      isDisabled: zoomVideoEditWorkflow.isRunning(),
      onSelectEdit: (edit) => {
        void requestZoomVideoEdit(edit);
      },
    });
  }

  function openGridContextMenu(point) {
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
          collectionFilename: choice.collectionFilename,
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

  function onGlobalKeyDown(e) {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e) {
    handleAppKeyDown(e);
  }

  function onToggleTitles() {
    setTitlesHidden(!gridController.areTitlesHidden());
  }

  function onFsToggle() {
    if (zoomOverlay.isOpen()) closeZoom();
    fullscreenSession.onFsToggle();
  }

  function onFsChange() {
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
    onAddToCollection: openAddToCollectionDialog,
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

