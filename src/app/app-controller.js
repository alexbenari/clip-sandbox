import {
  getVideosAndCollectionFiles,
} from '../business-logic/load-clips.js';
import { ClipPipelineLoader } from '../business-logic/clip-pipeline-loader.js';
import { persistCollectionContent } from '../business-logic/persist-collection-content.js';
import {
  createAppState,
  clearPendingCollectionAction,
  nextClipId,
  pendingCollectionAction,
  refreshDirtyCollectionState,
  setCollectionInventory,
  setCurrentCollection,
  setCurrentFolderSession,
  setPendingCollectionAction,
  resetCollectionState,
} from './app-session-state.js';
import {
  enterFullScreen as enterFullScreenAdapter,
  exitFullScreen as exitFullScreenAdapter,
  isFullScreenActive,
} from '../adapters/browser/fullscreen-adapter.js';
import { createBrowserFileSystemService } from '../adapters/browser/browser-file-system-service.js';
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
  downloadedCollectionFileText,
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
import { renderActiveCollectionSelector } from '../ui/active-collection-selector.js';
import { createCollectionOptionForCollection } from '../ui/collection-option.js';
import {
  parseCollectionRefFromOptionValue,
  serializeCollectionRefToOptionValue,
} from '../ui/collection-option-value.js';
import { createContextMenuController } from '../ui/context-menu-controller.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel, updateCardLabel } from '../ui/clip-collection-grid-controller.js';
import { createCollectionConflictController } from '../ui/collection-conflict-controller.js';
import { createDeleteFromDiskDialogController } from '../ui/delete-from-disk-dialog-controller.js';
import { createSaveAsNewDialogController } from '../ui/save-as-new-dialog-controller.js';
import { createUnsavedChangesDialogController } from '../ui/unsaved-changes-dialog-controller.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { ClipCollectionContent } from '../domain/clip-collection-content.js';
import { collectionRefsEqual } from '../domain/collection-ref.js';

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
  const folderInput = document.getElementById('folderInput');
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
  const fileSystem = createBrowserFileSystemService({ win: window });
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

  function currentInventory() {
    return state.collectionInventory;
  }

  function currentContent() {
    return currentInventory()?.activeCollection() || null;
  }

  function currentCollectionRef() {
    return currentInventory()?.activeCollectionRef() || null;
  }

  function currentCollectionName() {
    return state.currentCollection?.name || currentContent()?.collectionName || '';
  }

  function activeCollectionOptions(inventory = currentInventory()) {
    if (!inventory) return [];
    return inventory.selectableCollections()
      .map((collection) => createCollectionOptionForCollection(collection, inventory))
      .filter(Boolean);
  }

  function activeCollectionFilename() {
    return currentInventory()?.backingFilenameFor(currentContent()) || '';
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
    const inventory = currentInventory();
    const label = activeCollectionText(currentCollectionName());
    document.title = activeCollectionTabText(currentCollectionName());
    renderActiveCollectionSelector({
      selectEl: activeCollectionNameEl,
      options: activeCollectionOptions(inventory),
      selectedValue: serializeCollectionRefToOptionValue(inventory?.activeCollectionRef()),
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
    clearPendingCollectionAction(state);
    renderCollectionSelector();
  }

  function openSaveAsNewDialog() {
    saveAsNewDialogController.open();
  }

  function addToCollectionValidationErrorText(code) {
    if (code === 'required') return saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (code === 'already-exists') return collectionAlreadyExistsText();
    return '';
  }

  function validateAddToCollectionName(name) {
    let validationCode = ClipCollectionContent.validateCollectionName(name).code;
    if (!validationCode) {
      const candidateFilename = ClipCollectionContent.filenameFromCollectionName(name || '');
      if (currentInventory()?.getCollectionByFilename(candidateFilename)) validationCode = 'already-exists';
    }
    return addToCollectionValidationErrorText(validationCode);
  }

  function renderActionButtons() {
    const hasSelection = gridController?.getSelectedClipIds?.().length > 0;
    if (addToCollectionBtn) {
      addToCollectionBtn.disabled = !currentInventory() || !hasSelection;
    }
    if (deleteFromDiskBtn) {
      deleteFromDiskBtn.disabled = !currentInventory() || !hasSelection || !canDeleteFromDisk();
    }
  }

  function addToCollectionChoices() {
    const inventory = currentInventory();
    if (!inventory) return [];
    return inventory.eligibleDestinationCollections(inventory.activeCollectionRef())
      .map((collection) => createCollectionOptionForCollection(collection, inventory))
      .filter(Boolean);
  }

  function openAddToCollectionDialog({ startWithNewCollection = false } = {}) {
    if (!currentInventory()) return;
    addToCollectionDialogController.open({
      choices: addToCollectionChoices(),
      hasSelection: gridController?.getSelectedClipIds?.().length > 0,
      startWithNewCollection,
    });
  }

  async function runAddToCollection(destination, { showDialogValidation = false } = {}) {
    if (!state.currentCollection || !currentInventory()) return { ok: false, code: 'missing-context' };

    const result = await collectionManager.addSelectedClipsToCollection({
      selectedClipIds: gridController.getSelectedClipIds(),
      sourceCollectionRef: currentInventory().activeCollectionRef(),
      destination,
      currentCollection: state.currentCollection,
      inventory: currentInventory(),
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
    const action = pendingCollectionAction(state);
    unsavedChangesDialogController.open({
      message: action?.type === 'browse-folder'
        ? 'The current collection has unsaved changes. Save before browsing to another folder?'
        : 'The current collection has unsaved changes. Save before switching collections?',
      onSave: () => {
        void continuePendingAction({ saveFirst: true });
      },
      onDiscard: () => {
        void continuePendingAction({ saveFirst: false });
      },
      onCancel: () => {
        clearPendingCollectionAction(state);
        renderCollectionSelector();
      },
    });
  }

  function closeUnsavedDialog() {
    unsavedChangesDialogController.close();
  }

  function buildDeleteRequestFromSelection() {
    if (!state.currentCollection || !currentInventory()) return null;
    const selectedClipIds = gridController.getSelectedClipIds();
    if (selectedClipIds.length === 0) return null;
    const selectedClipNames = state.currentCollection.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) return null;
    return {
      selectedClipIds,
      selectedClipNames,
      affectedSavedCollectionCount: currentInventory().savedCollectionEntriesContainingClipNames(selectedClipNames).length,
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
    if (!deleteRequest || !state.currentCollection || !currentInventory()) return;
    deleteFromDiskDialogController.closeConfirm();
    pendingDeleteRequest = null;

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: deleteRequest.selectedClipIds,
      currentCollection: state.currentCollection,
      inventory: currentInventory(),
      currentFolderSession: state.currentFolderSession,
    });

    if (result.deletedClipIds.length > 0) {
      state.currentCollection.removeMany(result.deletedClipIds);
      applyCollection(state.currentCollection, {
        inventory: currentInventory(),
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
    if (state.hasDirtyCollectionChanges) {
      openDeletePreflightDialog();
      return;
    }
    openDeleteFromDiskDialog(deleteRequest);
  }

  function applyCollection(collection, { inventory = currentInventory(), folderSession = state.currentFolderSession, statusText = '', timeout = 2500 } = {}) {
    hideCollectionConflict();
    clipContextMenuController.close({ restoreFocus: false });
    addToCollectionDialogController.close();
    setCurrentFolderSession(state, folderSession || null);
    setCollectionInventory(state, inventory || null);
    setCurrentCollection(state, collection || null);
    refreshDirtyCollectionState(state, { collection, inventory });
    gridController.renderCollection(collection);
    renderCollectionSelector();
    renderActionButtons();
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
    resetCollectionState(state);
    setCurrentFolderSession(state, null);
    renderCollectionSelector();
    updateCount();
    renderActionButtons();
  }

  function initialLoadStatusText(inventory, result) {
    const activeCollection = inventory.activeCollection();
    if (inventory.videoNames().length === 0 && activeCollection?.isDefault) {
      return 'No video files found in the selected folder.';
    }
    if (activeCollection?.isDefault) {
      return loadedVideosText(result.collection.orderedClips().length);
    }
    return collectionLoadedText(result.collection.orderedClips().length);
  }

  function queueMissingConflict(conflict, handlers) {
    showCollectionConflictPanel(conflict, handlers);
  }

  async function applyCollectionSelection(collectionContent, { inventory = currentInventory(), folderSession = state.currentFolderSession } = {}) {
    if (!inventory || !collectionContent) return;
    const collectionRef = inventory.collectionRefFor(collectionContent);
    const loaded = clipPipelineLoader.loadCollectionByRef({
      inventory,
      collectionRef,
      nextClipId: () => nextClipId(state),
    });
    if (!loaded) return;
    const { collectionContent: resolvedCollectionContent, materialization: result } = loaded;
    if (result.kind === 'has-missing') {
      queueMissingConflict(result, {
        onApply: () => {
          if (result.existingNamesInOrder.length === 0) {
            renderCollectionSelector();
            showStatus(noCollectionMatchesText(result.missingCount), 4500);
            return;
          }
          inventory.setActiveCollection(resolvedCollectionContent);
          applyCollection(result.partialCollection, {
            inventory,
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

    inventory.setActiveCollection(resolvedCollectionContent);
    applyCollection(result.collection, {
      inventory,
      folderSession,
      statusText: collectionLoadedText(result.collection.orderedClips().length),
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
      const { inventory, initialCollectionContent, materialization: result } = loaded;

      if (result.kind === 'has-missing') {
        queueMissingConflict(result, {
          onApply: () => {
            if (result.existingNamesInOrder.length === 0) {
              showStatus(noCollectionMatchesText(result.missingCount), 4500);
              return;
            }
            inventory.setActiveCollection(initialCollectionContent);
            applyCollection(result.partialCollection, {
              inventory,
              folderSession,
              statusText: collectionPartiallyLoadedText(result.existingNamesInOrder.length, result.missingCount),
              timeout: 4000,
            });
          },
          onCancel: () => {},
        });
        return;
      }

      applyCollection(result.collection, {
        inventory,
        folderSession,
        statusText: initialLoadStatusText(inventory, result),
      });
      if (result.collection.orderedClips().length > 0) {
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
    if (fileSystem.canUseDirectoryPicker()) {
      try {
        const selection = await fileSystem.pickFolder({
          onFileReadError: (info, folderSession) => diagnostics.logDirectoryReadError(info, folderSession),
        });
        await loadPipeline(selection);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('Directory picker unavailable, falling back.', err);
      }
    }
    try {
      if (typeof folderInput.showPicker === 'function') folderInput.showPicker();
      else folderInput.click();
    } catch {
      folderInput.click();
    }
  }

  async function onPickFolder() {
    if (state.hasDirtyCollectionChanges) {
      setPendingCollectionAction(state, { type: 'browse-folder' });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    await triggerFolderPicker();
  }

  async function continuePendingAction({ saveFirst }) {
    const inventory = currentInventory();
    const nextPendingAction = pendingCollectionAction(state);
    closeUnsavedDialog();
    if (!nextPendingAction) {
      renderCollectionSelector();
      return;
    }
    if (saveFirst) {
      const saveResult = await saveCollection();
      if (saveResult?.deferred) return;
    }
    clearPendingCollectionAction(state);
    if (nextPendingAction.type === 'browse-folder') {
      await triggerFolderPicker();
      return;
    }
    if (nextPendingAction.type === 'switch-collection') {
      await applyCollectionSelection(currentInventory()?.getCollectionByRef(nextPendingAction.collectionRef));
      return;
    }
    renderCollectionSelector();
  }

  async function saveCollection(filename = activeCollectionFilename(), { makeActive = true } = {}) {
    if (!state.currentCollection || !currentInventory()) return null;
    const targetFilename = ClipCollectionContent.filenameFromCollectionName(filename || '');
    if (!targetFilename) {
      openSaveAsNewDialog();
      return { deferred: true };
    }
    const nextContent = state.currentCollection.toCollectionContent({
      filename: targetFilename,
    });

    const { mode } = await persistCollectionContent({
      fileSystem,
      content: nextContent,
      currentFolderSession: state.currentFolderSession,
      inventory: currentInventory(),
      makeActive,
    });
    showStatus(
      mode === 'saved'
        ? savedCollectionFileText(nextContent.filename)
        : downloadedCollectionFileText(nextContent.filename)
    );
    if (makeActive) {
      currentInventory().setActiveCollection(nextContent);
      state.currentCollection.rename(nextContent.collectionName);
    }
    refreshDirtyCollectionState(state);
    renderCollectionSelector();
    return { mode, content: nextContent };
  }

  function validateSaveAsNewName(name) {
    const validation = ClipCollectionContent.validateCollectionName(name);
    if (validation.code === 'required') return saveAsNewNameRequiredText();
    if (validation.code === 'illegal-chars') return saveAsNewInvalidNameText();
    return '';
  }

  async function confirmSaveAsNew(rawName) {
    const validationError = validateSaveAsNewName(rawName);
    if (validationError) {
      saveAsNewDialogController.showValidationError(validationError, { focusInput: true });
      return;
    }
    await saveCollection(ClipCollectionContent.filenameFromCollectionName(rawName), { makeActive: true });
    saveAsNewDialogController.close();
    if (pendingDeleteRequest?.awaitingSave) {
      pendingDeleteRequest.awaitingSave = false;
      openDeleteFromDiskDialog(pendingDeleteRequest);
      return;
    }
    if (pendingCollectionAction(state)) {
      await continuePendingAction({ saveFirst: false });
    }
  }

  async function confirmAddToCollection(destination) {
    if (!state.currentCollection || !currentInventory()) return;
    await runAddToCollection(destination, { showDialogValidation: true });
  }

  async function confirmDeletePreflightSave() {
    if (!pendingDeleteRequest) return;
    deleteFromDiskDialogController.closePreflight();
    pendingDeleteRequest.awaitingSave = true;
    const saveResult = await saveCollection();
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
    const inventory = currentInventory();
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
            collectionRef: choice.collectionRef,
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
      disabled: !inventory || !hasSelection,
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
      if (!state.currentCollection) return;
      state.currentCollection.replaceOrder(orderedClipIds);
      refreshDirtyCollectionState(state);
      renderCollectionSelector();
    },
    onOpenClip: openZoomForClipId,
    onRemoveSelected: (orderedSelectedClipIds) => {
      if (zoomOverlay.isOpen() || !state.currentCollection) return;
      const removedClipIds = state.currentCollection.removeMany(orderedSelectedClipIds);
      if (removedClipIds.length === 0) return;
      refreshDirtyCollectionState(state);
      gridController.renderCollection(state.currentCollection);
      renderCollectionSelector();
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

  function onFolderInputChange(e) {
    const fileList = Array.from(e.target.files || []);
    const { videos, collectionFiles } = getVideosAndCollectionFiles(fileList);
    if (videos.length === 0 && collectionFiles.length === 0) {
      e.target.value = '';
      return;
    }
    const selection = fileSystem.selectionFromFileList(fileList);
    e.target.value = '';
    void loadPipeline(selection);
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
    if (!isFullscreen() && state.currentCollection) {
      gridController.renderCollection(state.currentCollection);
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
    folderInput,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    loadOrderBtn: null,
    orderFileInput: null,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void onPickFolder(),
    onFolderInputChange,
    onSaveOrder: () => void saveCollection(),
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
    const selectedCollectionRef = parseCollectionRefFromOptionValue(e.target.value);
    if (!currentInventory()) {
      renderCollectionSelector();
      return;
    }
    if (!selectedCollectionRef) {
      renderCollectionSelector();
      return;
    }
    if (collectionRefsEqual(selectedCollectionRef, currentCollectionRef())) {
      renderCollectionSelector();
      return;
    }
    if (state.hasDirtyCollectionChanges) {
      setPendingCollectionAction(state, { type: 'switch-collection', collectionRef: selectedCollectionRef });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    void applyCollectionSelection(currentInventory().getCollectionByRef(selectedCollectionRef));
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
