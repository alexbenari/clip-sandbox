import {
  getVideosAndCollectionFiles,
} from '../business-logic/load-clips.js';
import { materializeCollectionContent } from '../business-logic/load-collection.js';
import { buildCollectionInventory } from '../business-logic/load-collection-inventory.js';
import {
  createAppState,
  nextClipId,
  setCollectionInventory,
  setCurrentCollection,
  setCurrentDirHandle,
  resetCollectionState,
} from './app-session-state.js';
import {
  appendTextToDirectoryFile,
  canUseDirectoryPicker,
  folderNameFromFiles,
  pickDirectory,
  readFilesFromDirectory,
  saveTextToDirectory,
  downloadText,
} from '../adapters/browser/file-system-adapter.js';
import {
  enterFullScreen as enterFullScreenAdapter,
  exitFullScreen as exitFullScreenAdapter,
  isFullScreenActive,
} from '../adapters/browser/fullscreen-adapter.js';
import { delay, every, clear as clearClock } from '../adapters/browser/clock-adapter.js';
import { showStatus as showStatusAdapter, applyGridLayout as applyGridLayoutAdapter, updateClipCount } from '../adapters/browser/dom-renderer-adapter.js';
import { playBoundaryClank } from '../adapters/browser/audio-feedback-adapter.js';
import { persistCollectionContent } from '../business-logic/save-order.js';
import { CollectionManager } from '../business-logic/collection-manager.js';
import { normalizeCollectionFilename, validateCollectionName } from '../business-logic/collection-name.js';
import { createFullscreenSession } from './fullscreen-session.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from './event-binding.js';
import { createLayoutController } from '../ui/display-layout-controller.js';
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
  activeCollectionText,
  activeCollectionTabText,
  niceNum,
  DEFAULT_APP_TITLE,
} from './app-text.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';
import { createAddToCollectionDialogController } from '../ui/add-to-collection-dialog-controller.js';
import { renderActiveCollectionSelector } from '../ui/active-collection-selector.js';
import {
  createAddToCollectionChoice,
  parseCollectionRefFromOptionValue,
} from '../ui/collection-ref-presentation.js';
import { createContextMenuController } from '../ui/context-menu-controller.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel, updateCardLabel } from '../ui/clip-collection-grid-controller.js';
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
  const collectionManager = new CollectionManager({ saveTextToDirectory, downloadText });
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
  let pendingCollectionConflict = null;

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

  function activeCollectionFilename() {
    return currentContent()?.filename || '';
  }

  function isFullscreen() {
    return isFullScreenActive(document);
  }

  function applyGridLayout(cols, cellH) {
    applyGridLayoutAdapter(grid, cols, cellH);
  }

  const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = createLayoutController({
    grid,
    gridWrap,
    toolbar,
    fullscreenState,
    computeBestGrid,
    computeFsLayout,
    applyGridLayout,
    isFullscreen,
  });

  function renderCollectionSelector() {
    const inventory = currentInventory();
    const label = activeCollectionText(currentCollectionName());
    document.title = activeCollectionTabText(currentCollectionName());
    renderActiveCollectionSelector({
      selectEl: activeCollectionNameEl,
      inventory,
      label,
      defaultTitle: DEFAULT_APP_TITLE,
    });
  }

  function updateCount() {
    updateClipCount(countSpan, [saveBtn, saveAsNewBtn], grid.children.length, niceNum);
  }

  function closeZoom() {
    zoomOverlay.close();
  }

  function hideCollectionConflict() {
    if (collectionConflict) collectionConflict.hidden = true;
    if (collectionConflictSummary) collectionConflictSummary.textContent = '';
    if (collectionConflictList) collectionConflictList.textContent = '';
  }

  function showCollectionConflictPanel(conflict, handlers) {
    pendingCollectionConflict = { conflict, handlers };
    if (collectionConflictSummary) {
      collectionConflictSummary.textContent = collectionConflictSummaryText(
        conflict.existingNamesInOrder.length,
        conflict.missingCount
      );
    }
    if (collectionConflictList) collectionConflictList.textContent = collectionConflictListText(conflict.missingNames);
    if (collectionConflict) collectionConflict.hidden = false;
  }

  function clearSaveAsNewError() {
    if (saveAsNewError) saveAsNewError.textContent = '';
  }

  function closeSaveAsNewDialog() {
    if (saveAsNewDialog) saveAsNewDialog.hidden = true;
    if (saveAsNewNameInput) saveAsNewNameInput.value = '';
    clearSaveAsNewError();
  }

  function cancelSaveAsNewFlow() {
    closeSaveAsNewDialog();
    currentInventory()?.clearPendingAction();
    renderCollectionSelector();
  }

  function openSaveAsNewDialog() {
    if (!saveAsNewDialog || !saveAsNewNameInput) return;
    clearSaveAsNewError();
    saveAsNewDialog.hidden = false;
    saveAsNewNameInput.value = '';
    saveAsNewNameInput.focus();
  }

  function showSaveAsNewError(text) {
    if (saveAsNewError) saveAsNewError.textContent = text;
  }

  function addToCollectionValidationErrorText(code) {
    if (code === 'required') return saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (code === 'already-exists') return collectionAlreadyExistsText();
    return '';
  }

  function validateAddToCollectionName(name) {
    let validationCode = validateCollectionName(name).code;
    if (!validationCode) {
      const candidateFilename = normalizeCollectionFilename(name || '');
      if (currentInventory()?.getCollectionByFilename(candidateFilename)) validationCode = 'already-exists';
    }
    return addToCollectionValidationErrorText(validationCode);
  }

  function renderAddToCollectionButton() {
    if (!addToCollectionBtn) return;
    const hasSelection = gridController?.getSelectedClipIds?.().length > 0;
    addToCollectionBtn.disabled = !currentInventory() || !hasSelection;
  }

  function addToCollectionChoices() {
    const inventory = currentInventory();
    if (!inventory) return [];
    return inventory.eligibleDestinationCollections(inventory.activeCollectionRef())
      .map((collection) => createAddToCollectionChoice(collection, inventory))
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
      currentDirHandle: state.currentDirHandle,
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
    renderAddToCollectionButton();
    showStatus(addedSelectedClipsText(result.destinationName, result.addedCount, result.skippedCount), 4000);
    return result;
  }

  function openUnsavedDialog() {
    if (!unsavedChangesDialog) return;
    if (unsavedChangesText) {
      const action = currentInventory()?.pendingAction();
      unsavedChangesText.textContent = action?.type === 'browse-folder'
        ? 'The current collection has unsaved changes. Save before browsing to another folder?'
        : 'The current collection has unsaved changes. Save before switching collections?';
    }
    if (typeof unsavedChangesDialog.showModal === 'function') {
      unsavedChangesDialog.showModal();
      return;
    }
    unsavedChangesDialog.setAttribute('open', '');
  }

  function closeUnsavedDialog() {
    if (!unsavedChangesDialog) return;
    if (typeof unsavedChangesDialog.close === 'function' && unsavedChangesDialog.open) {
      unsavedChangesDialog.close();
      return;
    }
    unsavedChangesDialog.removeAttribute('open');
  }

  async function appendErrorLog(text, dirHandle = state.currentDirHandle) {
    if (!text) return false;
    if (dirHandle?.kind === 'directory' && dirHandle.getFileHandle) {
      try {
        await appendTextToDirectoryFile(dirHandle, ERROR_LOG_FILENAME, text);
        return true;
      } catch (err) {
        console.warn('Failed to append err.log in selected folder.', err);
      }
    }
    console.warn(text.trim());
    return false;
  }

  async function logInvalidDescription(result, dirHandle) {
    await appendErrorLog(validator.formatLogEntry(result, 'Collection enumeration'), dirHandle);
  }

  async function logRuntimeError(problem, err, dirHandle = state.currentDirHandle) {
    const detail = `Runtime error\nProblem: ${problem}\nDetails: ${err?.message || err}\n\n`;
    await appendErrorLog(detail, dirHandle);
  }

  async function logDirectoryReadError({ filename = '', attempts = 0, error } = {}, dirHandle) {
    const problem = filename
      ? `Failed to read folder entry: ${filename}`
      : 'Failed to read folder entry';
    const detail = `Directory enumeration error\nProblem: ${problem}\nAttempts: ${attempts}\nDetails: ${error?.message || error}\n\n`;
    await appendErrorLog(detail, dirHandle);
  }

  function applyCollection(collection, { inventory = currentInventory(), dirHandle = state.currentDirHandle, statusText = '', timeout = 2500 } = {}) {
    hideCollectionConflict();
    pendingCollectionConflict = null;
    clipContextMenuController.close({ restoreFocus: false });
    addToCollectionDialogController.close();
    setCurrentDirHandle(state, dirHandle || null);
    setCollectionInventory(state, inventory || null);
    setCurrentCollection(state, collection || null);
    inventory?.refreshDirtyState(collection);
    gridController.renderCollection(collection);
    renderCollectionSelector();
    renderAddToCollectionButton();
    if (statusText) showStatus(statusText, timeout);
  }

  function clearLoadedState() {
    hideCollectionConflict();
    pendingCollectionConflict = null;
    closeSaveAsNewDialog();
    addToCollectionDialogController.close();
    clipContextMenuController.close({ restoreFocus: false });
    closeUnsavedDialog();
    closeZoom();
    gridController.destroy();
    resetCollectionState(state);
    setCurrentDirHandle(state, null);
    renderCollectionSelector();
    updateCount();
    renderAddToCollectionButton();
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

  function materializeContent(inventory, collectionContent) {
    return materializeCollectionContent({
      content: collectionContent,
      availableVideoFiles: inventory.videoFiles(),
      nextClipId: () => nextClipId(state),
    });
  }

  function queueMissingConflict(conflict, handlers) {
    showCollectionConflictPanel(conflict, handlers);
  }

  async function applyCollectionSelection(collectionContent, { inventory = currentInventory(), dirHandle = state.currentDirHandle } = {}) {
    if (!inventory || !collectionContent) return;
    const result = materializeContent(inventory, collectionContent);
    if (result.kind === 'has-missing') {
      queueMissingConflict(result, {
        onApply: () => {
          if (result.existingNamesInOrder.length === 0) {
            renderCollectionSelector();
            showStatus(noCollectionMatchesText(result.missingCount), 4500);
            return;
          }
          inventory.setActiveCollection(collectionContent);
          applyCollection(result.partialCollection, {
            inventory,
            dirHandle,
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

    inventory.setActiveCollection(collectionContent);
    applyCollection(result.collection, {
      inventory,
      dirHandle,
      statusText: collectionLoadedText(result.collection.orderedClips().length),
    });
  }

  async function loadFolderSelection({ dirHandle = null, files = [], folderName = '' } = {}) {
    try {
      const { inventory } = await buildCollectionInventory({
        folderName,
        files,
        validator,
        logInvalidDescription: (result) => logInvalidDescription(result, dirHandle),
      });
      inventory.setActiveCollection(inventory.defaultCollection());
      const initialCollection = inventory.activeCollection();
      const result = materializeContent(inventory, initialCollection);

      if (result.kind === 'has-missing') {
        queueMissingConflict(result, {
          onApply: () => {
            if (result.existingNamesInOrder.length === 0) {
              showStatus(noCollectionMatchesText(result.missingCount), 4500);
              return;
            }
            inventory.setActiveCollection(initialCollection);
            applyCollection(result.partialCollection, {
              inventory,
              dirHandle,
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
        dirHandle,
        statusText: initialLoadStatusText(inventory, result),
      });
      if (result.collection.orderedClips().length > 0) {
        await delay(20);
        recomputeLayout();
      }
    } catch (err) {
      await logRuntimeError('Failed to load the selected folder.', err, dirHandle);
      showStatus(collectionReadErrorText(err), 4000);
    }
  }

  async function triggerFolderPicker() {
    hideCollectionConflict();
    if (canUseDirectoryPicker()) {
      try {
        const dirHandle = await pickDirectory();
        const files = await readFilesFromDirectory(dirHandle, {
          onFileReadError: (info) => logDirectoryReadError(info, dirHandle),
        });
        await loadFolderSelection({
          dirHandle,
          files,
          folderName: dirHandle?.name || '',
        });
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
    if (currentInventory()?.hasDirtyChanges()) {
      currentInventory().setPendingAction({ type: 'browse-folder' });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    await triggerFolderPicker();
  }

  async function continuePendingAction({ saveFirst }) {
    const inventory = currentInventory();
    const pendingAction = inventory?.pendingAction();
    closeUnsavedDialog();
    if (!pendingAction) {
      renderCollectionSelector();
      return;
    }
    if (saveFirst) {
      const saveResult = await saveCollection();
      if (saveResult?.deferred) return;
    }
    inventory?.clearPendingAction();
    if (pendingAction.type === 'browse-folder') {
      await triggerFolderPicker();
      return;
    }
    if (pendingAction.type === 'switch-collection') {
      await applyCollectionSelection(currentInventory()?.getCollectionByRef(pendingAction.collectionRef));
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
      content: nextContent,
      currentDirHandle: state.currentDirHandle,
      saveTextToDirectory,
      downloadText,
    });
    showStatus(
      mode === 'saved'
        ? savedCollectionFileText(nextContent.filename)
        : downloadedCollectionFileText(nextContent.filename)
    );

    currentInventory().upsertCollectionContent(nextContent, { makeActive });
    if (makeActive) {
      currentInventory().setActiveCollection(nextContent);
      state.currentCollection.rename(nextContent.collectionName);
    }
    currentInventory().refreshDirtyState(state.currentCollection);
    renderCollectionSelector();
    return { mode, content: nextContent };
  }

  function validateSaveAsNewName(name) {
    const validation = validateCollectionName(name);
    if (validation.code === 'required') return saveAsNewNameRequiredText();
    if (validation.code === 'illegal-chars') return saveAsNewInvalidNameText();
    return '';
  }

  async function confirmSaveAsNew() {
    const rawName = saveAsNewNameInput?.value || '';
    const validationError = validateSaveAsNewName(rawName);
    if (validationError) {
      showSaveAsNewError(validationError);
      saveAsNewNameInput?.focus();
      return;
    }
    await saveCollection(normalizeCollectionFilename(rawName), { makeActive: true });
    closeSaveAsNewDialog();
    if (currentInventory()?.pendingAction()) {
      await continuePendingAction({ saveFirst: false });
    }
  }

  async function confirmAddToCollection(destination) {
    if (!state.currentCollection || !currentInventory()) return;
    await runAddToCollection(destination, { showDialogValidation: true });
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

    clipContextMenuController.open({
      point,
      items,
    });
  }

  const gridController = createClipCollectionGridController({
    grid,
    gridRoot: gridWrap,
    formatLabel,
    updateCount,
    recomputeLayout,
    onSelectionChange: () => {
      renderAddToCollectionButton();
    },
    onOrderChange: (orderedClipIds) => {
      if (!state.currentCollection) return;
      state.currentCollection.replaceOrder(orderedClipIds);
      currentInventory()?.refreshDirtyState(state.currentCollection);
      renderCollectionSelector();
    },
    onOpenClip: openZoomForClipId,
    onRemoveSelected: (orderedSelectedClipIds) => {
      if (zoomOverlay.isOpen() || !state.currentCollection) return;
      const removedClipIds = state.currentCollection.removeMany(orderedSelectedClipIds);
      if (removedClipIds.length === 0) return;
      currentInventory()?.refreshDirtyState(state.currentCollection);
      gridController.renderCollection(state.currentCollection);
      renderCollectionSelector();
      showStatus(removedClipsText(removedClipIds.length));
    },
    onContextMenu: ({ point }) => {
      if (zoomOverlay.isOpen() || isFullscreen()) return;
      openGridContextMenu(point);
    },
  });

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

  function onApplyCollectionConflict() {
    const pending = pendingCollectionConflict;
    hideCollectionConflict();
    pendingCollectionConflict = null;
    pending?.handlers?.onApply?.();
  }

  function onCancelCollectionConflict() {
    const pending = pendingCollectionConflict;
    hideCollectionConflict();
    pendingCollectionConflict = null;
    pending?.handlers?.onCancel?.();
  }

  function onGlobalKeyDown(e) {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e) {
    if (saveAsNewDialog && !saveAsNewDialog.hidden && e.key === 'Escape') {
      cancelSaveAsNewFlow();
      e.preventDefault();
      return;
    }
    if (addToCollectionDialogController.isOpen() && e.key === 'Escape') {
      e.preventDefault();
      addToCollectionDialogController.close();
      return;
    }
    if (unsavedChangesDialog?.open && e.key === 'Escape') {
      e.preventDefault();
      currentInventory()?.clearPendingAction();
      closeUnsavedDialog();
      renderCollectionSelector();
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
    if (addToCollectionDialogController.isOpen()) return;
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
    const folderName = folderNameFromFiles(fileList);
    e.target.value = '';
    void loadFolderSelection({
      dirHandle: null,
      files: fileList,
      folderName,
    });
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
  });

  bindControlEvents({
    pickBtn,
    folderInput,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    loadOrderBtn: null,
    orderFileInput: null,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void onPickFolder(),
    onFolderInputChange,
    onSaveOrder: () => void saveCollection(),
    onSaveAsNew: openSaveAsNewDialog,
    onAddToCollection: openAddToCollectionDialog,
    onLoadOrderClick: () => {},
    onOrderFileChange: () => {},
    onToggleTitles,
    onFsToggle,
  });

  applyCollectionConflictBtn?.addEventListener('click', onApplyCollectionConflict);
  cancelCollectionConflictBtn?.addEventListener('click', onCancelCollectionConflict);
  confirmSaveAsNewBtn?.addEventListener('click', () => void confirmSaveAsNew());
  cancelSaveAsNewBtn?.addEventListener('click', cancelSaveAsNewFlow);
  saveAsNewNameInput?.addEventListener('input', clearSaveAsNewError);
  saveAsNewNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmSaveAsNew();
    }
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
    if (currentInventory().hasDirtyChanges()) {
      currentInventory().setPendingAction({ type: 'switch-collection', collectionRef: selectedCollectionRef });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    void applyCollectionSelection(currentInventory().getCollectionByRef(selectedCollectionRef));
  });
  confirmUnsavedChangesBtn?.addEventListener('click', () => void continuePendingAction({ saveFirst: true }));
  discardUnsavedChangesBtn?.addEventListener('click', () => void continuePendingAction({ saveFirst: false }));
  cancelUnsavedChangesBtn?.addEventListener('click', () => {
    currentInventory()?.clearPendingAction();
    closeUnsavedDialog();
    renderCollectionSelector();
  });
  unsavedChangesDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    currentInventory()?.clearPendingAction();
    closeUnsavedDialog();
    renderCollectionSelector();
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
