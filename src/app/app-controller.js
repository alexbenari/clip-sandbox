import { ClipPipelineLoader } from '../business-logic/clip-pipeline-loader.js';
import { persistCollectionContent } from '../business-logic/persist-collection-content.js';
import {
  createAppState,
  clearPendingSourceAction,
  nextClipId,
  pendingSourceAction,
  refreshDirtyClipSequenceState,
  setActiveSource,
  setCurrentClipSequence,
  setCurrentPipeline,
  setCurrentFolderSession,
  setPendingSourceAction,
  resetClipSequenceState,
} from './app-session-state.js';
import {
  enterFullScreen as enterFullScreenAdapter,
  exitFullScreen as exitFullScreenAdapter,
  isFullScreenActive,
} from '../adapters/browser/fullscreen-adapter.js';
import { createElectronFileSystemService } from '../adapters/electron/electron-file-system-service.js';
import { delay, every, clear as clearClock } from '../adapters/browser/clock-adapter.js';
import { showStatus as showStatusAdapter, applyGridLayout as applyGridLayoutAdapter, updateClipCount } from '../adapters/browser/dom-renderer-adapter.js';
import { playBoundaryClank } from '../adapters/browser/audio-feedback-adapter.js';
import { ClipPipeline } from '../business-logic/clip-pipeline.js';
import { CollectionManager } from '../business-logic/collection-manager.js';
import { createFullscreenSession } from './fullscreen-session.js';
import { createAppDiagnostics } from './app-diagnostics.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from './event-binding.js';
import {
  computeBestGrid,
  computeFsLayout,
  normalizeFsSlots,
} from '../ui/display-layout-rules.js';
import {
  fullscreenSlotsText,
  loadedVideosText,
  collectionLoadedText,
  collectionPartiallyLoadedText,
  collectionReadErrorText,
  collectionConflictSummaryText,
  collectionConflictListText,
  noCollectionMatchesText,
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  collectionAlreadyExistsText,
  savedCollectionFileText,
  removedClipsText,
  addedSelectedClipsText,
  addSelectedClipsFailedText,
  deleteFromDiskPreflightText,
  deleteFromDiskConfirmationText,
  deleteFromDiskPreviewOverflowText,
  deleteFromDiskResultText,
  activeCollectionText,
  activeCollectionTabText,
  countText,
  niceNum,
  DEFAULT_APP_TITLE,
} from './app-text.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';
import { createAddToCollectionDialogController } from '../ui/add-to-collection-dialog-controller.js';
import { renderActiveSourceSelector } from '../ui/active-source-selector.js';
import { createSourceOption } from '../ui/source-option.js';
import {
  parseSourceIdFromOptionValue,
  serializeSourceIdToOptionValue,
} from '../ui/source-option-value.js';
import { createContextMenuController } from '../ui/context-menu-controller.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel, updateCardLabel } from '../ui/clip-collection-grid-controller.js';
import { createCollectionConflictController } from '../ui/collection-conflict-controller.js';
import { createDeleteFromDiskDialogController } from '../ui/delete-from-disk-dialog-controller.js';
import { createSaveAsNewDialogController } from '../ui/save-as-new-dialog-controller.js';
import { createUnsavedChangesDialogController } from '../ui/unsaved-changes-dialog-controller.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { Collection } from '../domain/collection.js';
import {
  sourceIdOf,
  sourceLabelOf,
  supportsNonPhysicalDelete,
  supportsSaveToExisting,
} from '../domain/clip-sequence-source.js';
import { sourceIdsEqual } from '../domain/source-id.js';

let initialized = false;
const ERROR_LOG_FILENAME = 'err.log';
const NEW_COLLECTION_CHOICE_VALUE = '__new_collection__';

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
  const statusBar = document.getElementById('status');
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
  const zoomOverlay = createZoomOverlayController({ mountEl: zoomLayerRoot, document });
  const fileSystem = createElectronFileSystemService({ win: window });
  const collectionManager = new CollectionManager({ fileSystem });
  const clipPipeline = new ClipPipeline({ fileSystem });
  const clipPipelineLoader = new ClipPipelineLoader();
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
  const addToCollectionDialogController = createAddToCollectionDialogController({
    dialog: addToCollectionDialog,
    destinationSelect: addToCollectionSelect,
    newCollectionNameLabel: addToCollectionNameLabel,
    newCollectionNameInput: addToCollectionNameInput,
    errorMessageEl: addToCollectionError,
    confirmBtn: confirmAddToCollectionBtn,
    cancelBtn: cancelAddToCollectionBtn,
    newChoiceValue: NEW_COLLECTION_CHOICE_VALUE,
    validateNewName: (name) => validateAddToCollectionName(name),
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
    nameInput: saveAsNewNameInput,
    errorMessageEl: saveAsNewError,
    confirmBtn: confirmSaveAsNewBtn,
    cancelBtn: cancelSaveAsNewBtn,
    validateName: (name) => validateSaveAsNewName(name),
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
    showStatusAdapter(statusBar, msg, timeout);
  }

  function currentPipeline() {
    return state.currentPipeline;
  }

  function activeSource() {
    return state.activeSource;
  }

  function activeSourceId() {
    return activeSource() ? sourceIdOf(activeSource()) : null;
  }

  function currentSequenceName() {
    return state.currentClipSequence?.name || (activeSource() ? sourceLabelOf(activeSource()) : '') || '';
  }

  function activeSourceOptions(pipeline = currentPipeline()) {
    if (!pipeline) return [];
    return pipeline.selectableSources()
      .map((source) => createSourceOption(source))
      .filter(Boolean);
  }

  function activeSourceFilename() {
    return activeSource()?.existingSaveFilename?.() || '';
  }

  function canDeleteFromDisk() {
    return fileSystem.canMutateDisk(state.currentFolderSession);
  }

  function isFullscreen() {
    return isFullScreenActive(document);
  }

  function applyGridLayout(cols, cellH) {
    applyGridLayoutAdapter(grid, cols, cellH);
  }

  function renderCollectionSelector() {
    const label = activeCollectionText(currentSequenceName());
    document.title = activeCollectionTabText(currentSequenceName());
    renderActiveSourceSelector({
      selectEl: activeCollectionNameEl,
      options: activeSourceOptions(currentPipeline()),
      selectedValue: serializeSourceIdToOptionValue(activeSourceId()),
      label,
      defaultTitle: DEFAULT_APP_TITLE,
    });
  }

  function updateCount() {
    const count = grid.children.length;
    updateClipCount(countSpan, [saveBtn, saveAsNewBtn], {
      text: countText(count, niceNum),
      disableButtons: count === 0,
    });
  }

  function closeZoom() {
    zoomOverlay.close();
  }

  function hideCollectionConflict() {
    collectionConflictController.hide();
  }

  function showCollectionConflictPanel(conflict, handlers) {
    collectionConflictController.show({
      summary: collectionConflictSummaryText(
        conflict.existingNamesInOrder.length,
        conflict.missingCount
      ),
      list: collectionConflictListText(conflict.missingNames),
      onApply: handlers?.onApply,
      onCancel: handlers?.onCancel,
    });
  }

  function cancelSaveAsNewFlow() {
    saveAsNewDialogController.close();
    if (pendingDeleteRequest?.awaitingSave) {
      pendingDeleteRequest = null;
    }
    clearPendingSourceAction(state);
    renderCollectionSelector();
  }

  function openSaveAsNewDialog() {
    updateSaveDialogCopy();
    saveAsNewDialogController.open();
  }

  function addToCollectionValidationErrorText(code) {
    if (code === 'required') return saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (code === 'already-exists') return collectionAlreadyExistsText();
    return '';
  }

  function validateAddToCollectionName(name) {
    let validationCode = Collection.validateCollectionName(name).code;
    if (!validationCode) {
      const candidateFilename = Collection.filenameFromCollectionName(name || '');
      if (currentPipeline()?.getCollectionByFilename(candidateFilename)) validationCode = 'already-exists';
    }
    return addToCollectionValidationErrorText(validationCode);
  }

  function renderActionButtons() {
    const hasSelection = gridController?.getSelectedClipIds?.().length > 0;
    if (addToCollectionBtn) {
      addToCollectionBtn.disabled = !currentPipeline() || !hasSelection;
    }
    if (deleteFromDiskBtn) {
      deleteFromDiskBtn.disabled = !currentPipeline() || !hasSelection || !canDeleteFromDisk();
    }
  }

  function addToCollectionChoices() {
    const pipeline = currentPipeline();
    if (!pipeline) return [];
    return pipeline.eligibleDestinationCollections(activeSourceId())
      .map((collection) => createSourceOption(collection))
      .filter(Boolean);
  }

  function openAddToCollectionDialog({ startWithNewCollection = false } = {}) {
    if (!currentPipeline()) return;
    addToCollectionDialogController.open({
      choices: addToCollectionChoices(),
      hasSelection: gridController?.getSelectedClipIds?.().length > 0,
      startWithNewCollection,
    });
  }

  async function runAddToCollection(destination, { showDialogValidation = false } = {}) {
    if (!state.currentClipSequence || !currentPipeline()) return { ok: false, code: 'missing-context' };

    const result = await collectionManager.addSelectedClipsToCollection({
      selectedClipIds: gridController.getSelectedClipIds(),
      sourceId: activeSourceId(),
      destination,
      currentClipSequence: state.currentClipSequence,
      pipeline: currentPipeline(),
      currentFolderSession: state.currentFolderSession,
    });

    if (!result.ok) {
      const validationError = addToCollectionValidationErrorText(result.code);
      if (showDialogValidation && validationError) {
        addToCollectionDialogController.showValidationError(validationError, {
          focusNameInput: destination.kind === 'new',
        });
        return result;
      }
      if (showDialogValidation) addToCollectionDialogController.close();
      showStatus(addSelectedClipsFailedText(result.destinationName, result.error || result.code), 4000);
      return result;
    }

    addToCollectionDialogController.close();
    renderCollectionSelector();
    renderActionButtons();
    showStatus(addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
    return result;
  }

  function openUnsavedDialog() {
    const action = pendingSourceAction(state);
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
        clearPendingSourceAction(state);
        renderCollectionSelector();
      },
    });
  }

  function closeUnsavedDialog() {
    unsavedChangesDialogController.close();
  }

  function buildDeleteRequestFromSelection() {
    if (!state.currentClipSequence || !currentPipeline()) return null;
    const selectedClipIds = gridController.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = state.currentClipSequence.clipNamesForIdsInOrder(selectedClipIds);
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
    if (!deleteRequest) return;
    const summary = deleteFromDiskConfirmationText(
        deleteRequest.selectedClipNames.length,
        deleteRequest.affectedSavedCollectionCount,
      );
    const previewNames = deleteRequest.selectedClipNames.slice(0, 5);
    const hiddenCount = Math.max(0, deleteRequest.selectedClipNames.length - previewNames.length);
    const preview = hiddenCount > 0
      ? `${previewNames.join('\n')}\n${deleteFromDiskPreviewOverflowText(hiddenCount)}`
      : previewNames.join('\n');
    deleteFromDiskDialogController.openConfirm({
      summary,
      preview,
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
    if (!deleteRequest || !state.currentClipSequence || !currentPipeline()) return;
    deleteFromDiskDialogController.closeConfirm();
    pendingDeleteRequest = null;

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: deleteRequest.selectedClipIds,
      currentClipSequence: state.currentClipSequence,
      pipeline: currentPipeline(),
      currentFolderSession: state.currentFolderSession,
    });

    if (result.deletedClipIds.length > 0) {
      await reloadActiveSource({
        pipeline: currentPipeline(),
        source: activeSource(),
        folderSession: state.currentFolderSession,
      });
    } else {
      renderActionButtons();
    }

    if (result.failedDeletes.length > 0 || result.failedCollectionRewrites.length > 0) {
      await diagnostics.logDeleteFailures(result);
    }

    showStatus(deleteFromDiskResultText({
      deletedCount: result.deletedClipIds.length,
      failedDeleteCount: result.failedDeletes.length,
      cleanedSavedCollectionCount: result.cleanedSavedCollectionCount,
      failedCollectionRewriteCount: result.failedCollectionRewrites.length,
    }), 4500);
  }

  function openDeleteFromDiskFlow() {
    if (!canDeleteFromDisk()) return;
    const deleteRequest = buildDeleteRequestFromSelection();
    if (!deleteRequest) return;
    pendingDeleteRequest = deleteRequest;
    if (state.hasDirtyClipSequenceChanges) {
      openDeletePreflightDialog();
      return;
    }
    openDeleteFromDiskDialog(deleteRequest);
  }

  function applySource(clipSequence, {
    pipeline = currentPipeline(),
    source = activeSource(),
    folderSession = state.currentFolderSession,
    statusText = '',
    timeout = 2500,
  } = {}) {
    hideCollectionConflict();
    clipContextMenuController.close({ restoreFocus: false });
    addToCollectionDialogController.close();
    setCurrentFolderSession(state, folderSession || null);
    setCurrentPipeline(state, pipeline || null);
    setActiveSource(state, source || null);
    setCurrentClipSequence(state, clipSequence || null);
    refreshDirtyClipSequenceState(state, { clipSequence, activeSource: source });
    gridController.renderCollection(clipSequence);
    renderCollectionSelector();
    renderActionButtons();
    renderSaveCommands();
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
    resetClipSequenceState(state);
    setCurrentFolderSession(state, null);
    renderCollectionSelector();
    updateCount();
    renderActionButtons();
    renderSaveCommands();
  }

  function initialLoadStatusText(pipeline, source, result) {
    if (pipeline.videoNames().length === 0 && source === pipeline) {
      return 'No video files found in the selected folder.';
    }
    if (source === pipeline) {
      return loadedVideosText(result.sequence.orderedClips().length);
    }
    return collectionLoadedText(result.sequence.orderedClips().length);
  }

  function queueMissingConflict(conflict, handlers) {
    showCollectionConflictPanel(conflict, handlers);
  }

  async function reloadActiveSource({ pipeline = currentPipeline(), source = activeSource(), folderSession = state.currentFolderSession } = {}) {
    if (!pipeline || !source) return;
    const loaded = clipPipelineLoader.loadSourceById({
      pipeline,
      sourceId: sourceIdOf(source),
      nextClipId: () => nextClipId(state),
    });
    if (!loaded) return;
    const { source: resolvedSource, materialization: result } = loaded;
    if (result.kind === 'has-missing') {
      queueMissingConflict(result, {
        onApply: () => {
          if (result.existingNamesInOrder.length === 0) {
            renderCollectionSelector();
            showStatus(noCollectionMatchesText(result.missingCount), 4500);
            return;
          }
          applySource(result.partialSequence, {
            pipeline,
            source: resolvedSource,
            folderSession,
            statusText: collectionPartiallyLoadedText(result.existingNamesInOrder.length, result.missingCount),
            timeout: 4000,
          });
        },
        onCancel: () => {
          renderCollectionSelector();
        },
      });
      return;
    }

    applySource(result.sequence, {
      pipeline,
      source: resolvedSource,
      folderSession,
      statusText: resolvedSource === pipeline
        ? loadedVideosText(result.sequence.orderedClips().length)
        : collectionLoadedText(result.sequence.orderedClips().length),
    });
  }

  async function loadPipeline({ folderSession = null, files = [], folderName = '' } = {}) {
    try {
      const loaded = await clipPipelineLoader.loadPipeline({
        folderName,
        files,
        validator,
        logInvalidDescription: (result) => diagnostics.logInvalidDescription(result, folderSession),
        nextClipId: () => nextClipId(state),
      });
      const { pipeline, initialSource, materialization: result } = loaded;

      applySource(result.sequence, {
        pipeline,
        source: initialSource,
        folderSession,
        statusText: initialLoadStatusText(pipeline, initialSource, result),
      });
      if (result.sequence.orderedClips().length > 0) {
        await delay(20);
        recomputeLayout();
      }
    } catch (err) {
      await diagnostics.logRuntimeError('Failed to load the selected folder.', err, folderSession);
      showStatus(collectionReadErrorText(err), 4000);
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
      showStatus(collectionReadErrorText(err), 4000);
    }
  }

  async function onPickFolder() {
    if (state.hasDirtyClipSequenceChanges) {
      setPendingSourceAction(state, { type: 'browse-folder' });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    await triggerFolderPicker();
  }

  async function continuePendingAction({ saveFirst }) {
    const nextPendingAction = pendingSourceAction(state);
    closeUnsavedDialog();
    if (!nextPendingAction) {
      renderCollectionSelector();
      return;
    }
    if (saveFirst) {
      const saveResult = await saveActiveSource();
      if (saveResult?.deferred) return;
    }
    clearPendingSourceAction(state);
    if (nextPendingAction.type === 'browse-folder') {
      await triggerFolderPicker();
      return;
    }
    if (nextPendingAction.type === 'switch-source') {
      await reloadActiveSource({
        pipeline: currentPipeline(),
        source: currentPipeline()?.resolveSource(nextPendingAction.sourceId),
      });
      return;
    }
    renderCollectionSelector();
  }

  function renderSaveCommands() {
    const source = activeSource();
    if (!saveBtn || !saveAsNewBtn) return;
    saveBtn.disabled = !supportsSaveToExisting(source) || grid.children.length === 0;
    saveAsNewBtn.disabled = !state.currentClipSequence || grid.children.length === 0;
    saveAsNewBtn.textContent = source === currentPipeline()
      ? 'Save as Collection'
      : 'Save Collection As...';
    saveAsNewBtn.title = source === currentPipeline()
      ? 'Save the current pipeline view as a new collection file'
      : 'Save the current collection as another collection file';
  }

  function updateSaveDialogCopy() {
    const source = activeSource();
    if (source === currentPipeline()) {
      if (saveAsNewDialogTitle) saveAsNewDialogTitle.textContent = 'Save current pipeline view as a collection';
      if (saveAsNewDialogText) saveAsNewDialogText.textContent = 'Enter a collection name. The app will add .txt automatically.';
      if (confirmSaveAsNewBtn) confirmSaveAsNewBtn.textContent = 'Save Collection';
      return;
    }
    if (saveAsNewDialogTitle) saveAsNewDialogTitle.textContent = 'Save current collection as another collection';
    if (saveAsNewDialogText) saveAsNewDialogText.textContent = 'Enter a collection name. The app will add .txt automatically.';
    if (confirmSaveAsNewBtn) confirmSaveAsNewBtn.textContent = 'Save Collection';
  }

  async function saveActiveSource() {
    if (!state.currentClipSequence || !currentPipeline()) return null;
    if (!supportsSaveToExisting(activeSource())) {
      openSaveAsNewDialog();
      return { deferred: true };
    }
    const nextCollection = state.currentClipSequence.toCollection({
      filename: activeSourceFilename(),
    });

    const { mode } = await persistCollectionContent({
      fileSystem,
      content: nextCollection,
      currentFolderSession: state.currentFolderSession,
      pipeline: currentPipeline(),
    });
    const savedSource = currentPipeline().getCollectionByFilename(nextCollection.filename) || nextCollection;
    state.currentClipSequence.rename(nextCollection.collectionName);
    setActiveSource(state, savedSource);
    refreshDirtyClipSequenceState(state);
    renderCollectionSelector();
    renderSaveCommands();
    showStatus(savedCollectionFileText(nextCollection.filename));
    return { mode, content: nextCollection };
  }

  function validateSaveAsNewName(name) {
    const validation = Collection.validateCollectionName(name);
    if (validation.code === 'required') return saveAsNewNameRequiredText();
    if (validation.code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (!validation.code && currentPipeline()?.getCollectionByFilename(validation.filename)) return collectionAlreadyExistsText();
    return '';
  }

  async function confirmSaveAsNew(rawName) {
    const validationError = validateSaveAsNewName(rawName);
    if (validationError) {
      saveAsNewDialogController.showValidationError(validationError, { focusInput: true });
      return;
    }
    const filename = Collection.filenameFromCollectionName(rawName);
    const nextCollection = state.currentClipSequence.toCollection({ filename });
    const { mode } = await persistCollectionContent({
      fileSystem,
      content: nextCollection,
      currentFolderSession: state.currentFolderSession,
      pipeline: currentPipeline(),
    });
    const savedSource = currentPipeline().getCollectionByFilename(filename) || nextCollection;
    setActiveSource(state, savedSource);
    state.currentClipSequence.rename(savedSource.collectionName);
    refreshDirtyClipSequenceState(state, {
      clipSequence: state.currentClipSequence,
      activeSource: savedSource,
    });
    saveAsNewDialogController.close();
    renderCollectionSelector();
    renderSaveCommands();
    showStatus(savedCollectionFileText(filename));
    if (pendingDeleteRequest?.awaitingSave) {
      pendingDeleteRequest.awaitingSave = false;
      openDeleteFromDiskDialog(pendingDeleteRequest);
      return;
    }
    if (pendingSourceAction(state)) {
      await continuePendingAction({ saveFirst: false });
    }
    return { mode, collection: nextCollection };
  }

  async function confirmAddToCollection(destination) {
    if (!state.currentClipSequence || !currentPipeline()) return;
    await runAddToCollection(destination, { showDialogValidation: true });
  }

  async function confirmDeletePreflightSave() {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    pendingDeleteRequest.awaitingSave = true;
    const saveResult = await saveActiveSource();
    if (saveResult?.deferred) return;
    pendingDeleteRequest.awaitingSave = false;
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function continueDeleteWithoutSaving() {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    openDeleteFromDiskDialog(pendingDeleteRequest);
  }

  function renderTitlesToggleButton() {
    toggleTitlesBtn.textContent = gridController.areTitlesHidden() ? 'Show Titles' : 'Hide Titles';
  }

  function setTitlesHidden(hidden) {
    gridController.setTitlesHidden(hidden);
    renderTitlesToggleButton();
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
      playBoundaryClank(window);
      return false;
    }
    return openZoomForClip(nextClip);
  }

  function openGridContextMenu(point) {
    const hasSelection = gridController.getSelectedClipIds().length > 0;
    const canDeleteSelected = hasSelection && canDeleteFromDisk();
    const choices = addToCollectionChoices();
    const items = hasSelection
      ? choices.map((choice) => ({
        id: `add-to-${choice.value}`,
        label: `Add to ${choice.label}`,
        onSelect: () => {
          void runAddToCollection({
            kind: 'existing',
            sourceId: choice.sourceId,
          });
        },
      }))
      : [{
        id: 'add-to-collection-disabled',
        label: 'Select clips to add to a collection',
        disabled: true,
      }];
    items.push({
      id: 'new-collection',
      label: 'New collection...',
      disabled: !currentPipeline() || !hasSelection,
      onSelect: () => {
        openAddToCollectionDialog({ startWithNewCollection: true });
      },
    });
    if (canDeleteSelected) {
      items.push({
        id: 'delete-from-disk',
        label: 'Delete from Disk...',
        onSelect: () => {
          openDeleteFromDiskFlow();
        },
      });
    }

    clipContextMenuController.open({
      point,
      items,
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
    updateCount,
    onSelectionChange: () => {
      renderActionButtons();
    },
    onOrderChange: (orderedClipIds) => {
      if (!state.currentClipSequence) return;
      state.currentClipSequence.replaceOrder(orderedClipIds);
      refreshDirtyClipSequenceState(state);
      renderCollectionSelector();
      renderSaveCommands();
    },
    onOpenClip: openZoomForClipId,
    onRemoveSelected: (orderedSelectedClipIds) => {
      if (zoomOverlay.isOpen() || !state.currentClipSequence) return;
      if (!supportsNonPhysicalDelete(activeSource())) {
        openDeleteFromDiskFlow();
        return;
      }
      const removedClipIds = state.currentClipSequence.removeMany(orderedSelectedClipIds);
      if (removedClipIds.length === 0) return;
      refreshDirtyClipSequenceState(state);
      gridController.renderCollection(state.currentClipSequence);
      renderCollectionSelector();
      renderSaveCommands();
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
    body,
    fsBtn,
    isTitlesHidden: () => gridController.areTitlesHidden(),
    setTitlesHidden,
    enterFullScreenAdapter,
    exitFullScreenAdapter,
    isFullscreen,
    fsApplySlots,
    fsRestore,
    computeGrid,
    showStatus,
    normalizeFsSlots,
    fullscreenSlotsText,
    every,
    clearClock,
    updateCardLabel,
    formatLabel,
  });

  function onGlobalKeyDown(e) {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e) {
    if (saveAsNewDialogController.handleGlobalKeyDown(e)) {
      e.preventDefault();
      return;
    }
    if (addToCollectionDialogController.isOpen() && e.key === 'Escape') {
      e.preventDefault();
      addToCollectionDialogController.close();
      return;
    }
    if (deleteFromDiskDialogController.handleGlobalKeyDown(e)) {
      e.preventDefault();
      return;
    }
    if (unsavedChangesDialogController.handleGlobalKeyDown(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && zoomOverlay.isOpen()) {
      closeZoom();
      e.preventDefault();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (zoomOverlay.isOpen()) {
        e.preventDefault();
        return;
      }
      if (gridController.handleKeyDown(e)) return;
      return;
    }
    if (
      saveAsNewDialogController.isOpen()
      || addToCollectionDialogController.isOpen()
      || deleteFromDiskDialogController.isOpen()
      || unsavedChangesDialogController.isOpen()
    ) return;
    if (isEditableTarget(e.target)) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'f' || e.key === 'F') && zoomOverlay.isOpen()) {
      closeZoom();
      return;
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'a' || e.key === 'A') && zoomOverlay.isOpen()) {
      zoomOverlay.toggleMuted();
      e.preventDefault();
      return;
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && zoomOverlay.isOpen() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      browseZoomByOffset(e.key === 'ArrowRight' ? 1 : -1);
      e.preventDefault();
      return;
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'z' || e.key === 'Z')) {
      if (zoomOverlay.isOpen()) {
        e.preventDefault();
        return;
      }
      const selectedClipId = gridController.getSelectedClipId();
      if (selectedClipId && !isFullscreen()) {
        openZoomForClipId(selectedClipId);
        e.preventDefault();
      }
      return;
    }
    if (zoomOverlay.isOpen()) {
      return;
    }
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
    if (!isFullscreen() && state.currentClipSequence) {
      gridController.renderCollection(state.currentClipSequence);
    }
  }

  renderTitlesToggleButton();

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
    onSaveOrder: () => void saveActiveSource(),
    onSaveAsNew: openSaveAsNewDialog,
    onAddToCollection: openAddToCollectionDialog,
    onDeleteFromDisk: openDeleteFromDiskFlow,
    onLoadOrderClick: () => {},
    onOrderFileChange: () => {},
    onToggleTitles,
    onFsToggle,
  });

  activeCollectionNameEl?.addEventListener('change', (e) => {
    if (!(e.target instanceof HTMLSelectElement)) return;
    const selectedSourceId = parseSourceIdFromOptionValue(e.target.value);
    if (!currentPipeline()) {
      renderCollectionSelector();
      return;
    }
    if (!selectedSourceId) {
      renderCollectionSelector();
      return;
    }
    if (sourceIdsEqual(selectedSourceId, activeSourceId())) {
      renderCollectionSelector();
      return;
    }
    if (state.hasDirtyClipSequenceChanges) {
      setPendingSourceAction(state, { type: 'switch-source', sourceId: selectedSourceId });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    void reloadActiveSource({
      pipeline: currentPipeline(),
      source: currentPipeline().resolveSource(selectedSourceId),
    });
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
  renderSaveCommands();
}
