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
} from './app-state.js';
import {
  appendTextToDirectoryFile,
  canUseDirectoryPicker,
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
import { runSaveOrder } from '../business-logic/save-order.js';
import { createFullscreenSession } from '../business-logic/fullscreen-session.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from './event-binding.js';
import { createLayoutController } from './display-layout-controller.js';
import {
  computeBestGrid,
  computeFsLayout,
  normalizeFsSlots,
} from './display-layout-rules.js';
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
  savedCollectionFileText,
  downloadedCollectionFileText,
  removedClipsText,
  activeCollectionText,
  activeCollectionTabText,
  niceNum,
  DEFAULT_APP_TITLE,
} from './app-text.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel, updateCardLabel } from '../ui/clip-collection-grid-controller.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { ClipCollectionContent } from '../domain/clip-collection-content.js';

let initialized = false;
const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/;
const ERROR_LOG_FILENAME = 'err.log';

export function initApp() {
  if (initialized) return;
  initialized = true;
  'use strict';

  const pickBtn = document.getElementById('pickBtn');
  const saveBtn = document.getElementById('saveBtn');
  const saveAsNewBtn = document.getElementById('saveAsNewBtn');
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
  const unsavedChangesDialog = document.getElementById('unsavedChangesDialog');
  const unsavedChangesText = document.getElementById('unsavedChangesText');
  const confirmUnsavedChangesBtn = document.getElementById('confirmUnsavedChangesBtn');
  const discardUnsavedChangesBtn = document.getElementById('discardUnsavedChangesBtn');
  const cancelUnsavedChangesBtn = document.getElementById('cancelUnsavedChangesBtn');
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

  function currentCollectionName() {
    return state.currentCollection?.name || currentContent()?.collectionName || '';
  }

  function activeCollectionFilename() {
    return currentContent()?.filename || '';
  }

  function folderNameFromFiles(fileList) {
    const firstFile = Array.from(fileList || [])[0];
    const relPath = firstFile?.webkitRelativePath || '';
    if (!relPath) return '';
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
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
    if (!(activeCollectionNameEl instanceof HTMLSelectElement)) return;

    activeCollectionNameEl.innerHTML = '';
    if (!inventory) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = label || DEFAULT_APP_TITLE;
      activeCollectionNameEl.appendChild(option);
      activeCollectionNameEl.disabled = true;
      activeCollectionNameEl.value = '';
      activeCollectionNameEl.title = option.textContent;
      return;
    }

    for (const collectionContent of inventory.selectableCollections()) {
      const option = document.createElement('option');
      option.value = inventory.selectionValueFor(collectionContent);
      option.textContent = collectionContent.collectionName;
      activeCollectionNameEl.appendChild(option);
    }

    activeCollectionNameEl.disabled = false;
    activeCollectionNameEl.value = inventory.activeSelectionValue();
    activeCollectionNameEl.title = label || DEFAULT_APP_TITLE;
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
    setCurrentDirHandle(state, dirHandle || null);
    setCollectionInventory(state, inventory || null);
    setCurrentCollection(state, collection || null);
    inventory?.refreshDirtyState(collection);
    gridController.renderCollection(collection);
    renderCollectionSelector();
    if (statusText) showStatus(statusText, timeout);
  }

  function clearLoadedState() {
    hideCollectionConflict();
    pendingCollectionConflict = null;
    closeSaveAsNewDialog();
    closeUnsavedDialog();
    closeZoom();
    gridController.destroy();
    resetCollectionState(state);
    setCurrentDirHandle(state, null);
    renderCollectionSelector();
    updateCount();
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
      await applyCollectionSelection(currentInventory()?.getCollectionBySelectionValue(pendingAction.selectionValue));
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

    const mode = await runSaveOrder({
      names: nextContent.orderedClipNames,
      currentDirHandle: state.currentDirHandle,
      saveTextToDirectory,
      downloadText,
      showStatus,
      filename: nextContent.filename,
      buildSavedStatus: savedCollectionFileText,
      buildDownloadedStatus: downloadedCollectionFileText,
    });

    currentInventory().upsertCollectionContent(nextContent, { makeActive });
    if (makeActive) {
      currentInventory().setActiveCollection(nextContent);
      state.currentCollection.rename(nextContent.collectionName);
    }
    currentInventory().refreshDirtyState(state.currentCollection);
    renderCollectionSelector();
    return { mode, content: nextContent };
  }

  function normalizeCollectionFilename(name) {
    return ClipCollectionContent.filenameFromCollectionName((name || '').trim());
  }

  function validateSaveAsNewName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return saveAsNewNameRequiredText();
    if (WINDOWS_ILLEGAL_FILENAME_CHARS.test(trimmed)) return saveAsNewInvalidNameText();
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

  const gridController = createClipCollectionGridController({
    grid,
    gridRoot: gridWrap,
    formatLabel,
    updateCount,
    recomputeLayout,
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
  });

  bindControlEvents({
    pickBtn,
    folderInput,
    saveBtn,
    saveAsNewBtn,
    loadOrderBtn: null,
    orderFileInput: null,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void onPickFolder(),
    onFolderInputChange,
    onSaveOrder: () => void saveCollection(),
    onSaveAsNew: openSaveAsNewDialog,
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
    const selectedValue = e.target.value;
    if (!currentInventory()) {
      renderCollectionSelector();
      return;
    }
    if (selectedValue === currentInventory().activeSelectionValue()) {
      renderCollectionSelector();
      return;
    }
    if (currentInventory().hasDirtyChanges()) {
      currentInventory().setPendingAction({ type: 'switch-collection', selectionValue: selectedValue });
      renderCollectionSelector();
      openUnsavedDialog();
      return;
    }
    void applyCollectionSelection(currentInventory().getCollectionBySelectionValue(selectedValue));
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
