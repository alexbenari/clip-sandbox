import { isVideoFile, runLoadClips } from '../business-logic/load-clips.js';
import {
  computeBestGrid,
  computeFsLayout,
  normalizeFsSlots,
} from './display-layout-rules.js';
import { runLoadCollection, runLoadCollectionFromFile } from '../business-logic/load-collection.js';
import {
  createAppState,
  nextClipId,
  setCurrentCollection,
  setCurrentDirHandle,
  setFolderClips,
  resetCollectionState,
} from './app-state.js';
import {
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
import { runSaveOrder } from '../business-logic/save-order.js';
import { createFullscreenSession } from '../business-logic/fullscreen-session.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from './event-binding.js';
import { createLayoutController } from './display-layout-controller.js';
import {
  fullscreenSlotsText,
  loadedVideosText,
  collectionLoadedText,
  collectionPartiallyLoadedText,
  collectionEmptyErrorText,
  collectionDuplicateErrorText,
  collectionReadErrorText,
  collectionFirstUnavailableText,
  collectionConflictSummaryText,
  collectionConflictListText,
  noCollectionMatchesText,
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  savedCollectionFileText,
  downloadedCollectionFileText,
  DEFAULT_ACTIVE_COLLECTION_NAME,
  activeCollectionText,
  activeCollectionTabText,
  niceNum,
} from './app-text.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';
import { createZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { createClipCollectionGridController, formatLabel } from '../ui/clip-collection-grid-controller.js';
import { updateCardLabel } from '../ui/clip-collection-grid-controller.js';

let initialized = false;
const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/;

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
  const orderFileInput = document.getElementById('orderFileInput');
  const loadOrderBtn = document.getElementById('loadOrderBtn');
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
  const zoomOverlay = createZoomOverlayController({ mountEl: zoomLayerRoot, document });
  let pendingCollectionConflict = null;

  function showStatus(msg, timeout = 2500) {
    showStatusAdapter(statusBar, msg, timeout);
  }

  function normalizedCollectionName(name, fallback = '') {
    const trimmed = (name || '').trim();
    return trimmed || fallback;
  }

  function collectionNameFromFilename(filename) {
    return normalizedCollectionName((filename || '').replace(/\.txt$/i, ''));
  }

  function folderNameFromFiles(fileList) {
    const firstFile = Array.from(fileList || [])[0];
    const relPath = firstFile?.webkitRelativePath || '';
    if (!relPath) return '';
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  function implicitCollectionName(name) {
    return normalizedCollectionName(name, DEFAULT_ACTIVE_COLLECTION_NAME);
  }

  function currentCollectionName() {
    return state.currentCollection?.name || '';
  }

  function folderClipNames() {
    return state.folderClips.map((clip) => clip.name);
  }

  function renderActiveCollectionName() {
    const text = activeCollectionText(currentCollectionName());
    document.title = activeCollectionTabText(currentCollectionName());
    if (activeCollectionNameEl) {
      activeCollectionNameEl.textContent = text;
      activeCollectionNameEl.title = text;
    }
  }

  function updateCount() {
    updateClipCount(countSpan, [saveBtn, saveAsNewBtn], grid.children.length, niceNum);
  }

  function closeZoom() {
    zoomOverlay.close();
  }

  function clearGrid() {
    closeZoom();
    gridController.destroy();
    updateCount();
  }

  function hideCollectionConflict() {
    if (collectionConflict) collectionConflict.hidden = true;
    if (collectionConflictSummary) collectionConflictSummary.textContent = '';
    if (collectionConflictList) collectionConflictList.textContent = '';
  }

  function showCollectionConflictPanel(conflict) {
    pendingCollectionConflict = conflict;
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

  function openZoomForClipId(clipId) {
    if (!clipId || isFullscreen()) return false;
    const src = gridController.getClipMediaSource(clipId);
    if (!src) return false;
    gridController.setSelectedClipId(clipId);
    const clip = state.currentCollection?.getClip(clipId);
    return zoomOverlay.open({ src, name: clip?.name || '' });
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
    },
    onOpenClip: openZoomForClipId,
  });

  function resetLoadedCollectionView() {
    hideCollectionConflict();
    pendingCollectionConflict = null;
    closeSaveAsNewDialog();
    clearGrid();
    resetCollectionState(state);
    renderActiveCollectionName();
  }

  function applyCollection(collection, statusText, timeout = 2500) {
    hideCollectionConflict();
    pendingCollectionConflict = null;
    setCurrentCollection(state, collection);
    gridController.renderCollection(collection);
    renderActiveCollectionName();
    showStatus(statusText, timeout);
  }

  async function loadFiles(fileList, collectionName = DEFAULT_ACTIVE_COLLECTION_NAME) {
    const result = runLoadClips({
      fileList,
      collectionName: implicitCollectionName(collectionName),
      defaultCollectionName: DEFAULT_ACTIVE_COLLECTION_NAME,
      nextClipId: () => nextClipId(state),
    });
    setFolderClips(state, result.clips);
    setCurrentCollection(state, result.collection);
    pendingCollectionConflict = null;
    hideCollectionConflict();
    gridController.renderCollection(result.collection);
    renderActiveCollectionName();
    if (result.count > 0) {
      showStatus(loadedVideosText(result.count));
      await delay(20);
      recomputeLayout();
    }
    return result.count;
  }

  async function pickFolder() {
    resetLoadedCollectionView();
    if (canUseDirectoryPicker()) {
      try {
        setCurrentDirHandle(state, await pickDirectory());
        const files = (await readFilesFromDirectory(state.currentDirHandle)).filter(isVideoFile);
        if (files.length === 0) showStatus('No video files found in the selected folder.');
        await loadFiles(files, implicitCollectionName(state.currentDirHandle?.name));
        return;
      } catch (err) {
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

  async function saveCollection(filename = 'default-collection.txt') {
    await runSaveOrder({
      names: state.currentCollection?.clipNamesInOrder() || [],
      currentDirHandle: state.currentDirHandle,
      saveTextToDirectory,
      downloadText,
      showStatus,
      filename,
      buildSavedStatus: savedCollectionFileText,
      buildDownloadedStatus: downloadedCollectionFileText,
    });
  }

  function normalizeCollectionFilename(name) {
    const trimmed = (name || '').trim();
    if (!trimmed.toLowerCase().endsWith('.txt')) return `${trimmed}.txt`;
    return trimmed;
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
    const filename = normalizeCollectionFilename(rawName);
    await saveCollection(filename);
    state.currentCollection?.rename(collectionNameFromFilename(filename));
    renderActiveCollectionName();
    closeSaveAsNewDialog();
  }

  function renderTitlesToggleButton() {
    toggleTitlesBtn.textContent = gridController.areTitlesHidden() ? 'Show Titles' : 'Hide Titles';
  }

  function setTitlesHidden(hidden) {
    gridController.setTitlesHidden(hidden);
    renderTitlesToggleButton();
  }

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

  function handleCollectionResult(result) {
    if (result.kind === 'invalid-empty') {
      showStatus(collectionEmptyErrorText(), 4000);
      return;
    }
    if (result.kind === 'invalid-duplicates') {
      showStatus(collectionDuplicateErrorText(result.duplicateNames), 4500);
      return;
    }
    if (result.kind === 'has-missing') {
      showCollectionConflictPanel(result);
      return;
    }
    applyCollection(
      result.collection,
      collectionLoadedText(result.requestedNames.length),
      2500
    );
  }

  function onLoadOrderClick() {
    if (folderClipNames().length === 0) {
      showStatus(collectionFirstUnavailableText(), 4000);
      return;
    }
    if (typeof orderFileInput.showPicker === 'function') orderFileInput.showPicker();
    else orderFileInput.click();
  }

  async function onOrderFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      e.target.value = '';
      return;
    }
    try {
      const result = await runLoadCollectionFromFile({
        file,
        folderClips: state.folderClips,
        folderClipNames: folderClipNames(),
        currentCollectionName: currentCollectionName(),
      });
      handleCollectionResult(result);
    } catch (err) {
      showStatus(collectionReadErrorText(err), 4000);
    } finally {
      e.target.value = '';
    }
  }

  function onApplyCollectionConflict() {
    const conflict = pendingCollectionConflict;
    hideCollectionConflict();
    pendingCollectionConflict = null;
    if (!conflict) return;
    if (conflict.existingNamesInOrder.length === 0) {
      showStatus(noCollectionMatchesText(conflict.missingCount), 4500);
      return;
    }
    applyCollection(
      conflict.partialCollection,
      collectionPartiallyLoadedText(conflict.existingNamesInOrder.length, conflict.missingCount),
      4000
    );
  }

  function onCancelCollectionConflict() {
    hideCollectionConflict();
    pendingCollectionConflict = null;
  }

  function onGlobalKeyDown(e) {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e) {
    if (!saveAsNewDialog?.hidden && e.key === 'Escape') {
      closeSaveAsNewDialog();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && zoomOverlay.isOpen()) {
      closeZoom();
      e.preventDefault();
      return;
    }
    if (isEditableTarget(e.target)) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'f' || e.key === 'F') && zoomOverlay.isOpen()) {
      closeZoom();
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
      if (e.key === 'Delete' || e.key === 'Backspace') e.preventDefault();
      return;
    }
    if (!(e.key === 'Delete' || e.key === 'Backspace')) return;
    const selectedClipId = gridController.getSelectedClipId();
    if (!selectedClipId || !state.currentCollection) return;
    const removed = state.currentCollection.remove(selectedClipId);
    if (!removed) return;
    gridController.renderCollection(state.currentCollection);
    showStatus('Clip removed from view.');
    e.preventDefault();
  }

  function onFolderInputChange(e) {
    setCurrentDirHandle(state, null);
    resetLoadedCollectionView();
    void loadFiles(e.target.files, implicitCollectionName(folderNameFromFiles(e.target.files)));
  }

  createOrderMenuController({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn,
    saveBtn,
    saveAsNewBtn,
  });

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

  bindControlEvents({
    pickBtn,
    folderInput,
    saveBtn,
    saveAsNewBtn,
    loadOrderBtn,
    orderFileInput,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void pickFolder(),
    onFolderInputChange,
    onSaveOrder: () => void saveCollection(),
    onSaveAsNew: openSaveAsNewDialog,
    onLoadOrderClick,
    onOrderFileChange,
    onToggleTitles,
    onFsToggle,
  });

  applyCollectionConflictBtn?.addEventListener('click', onApplyCollectionConflict);
  cancelCollectionConflictBtn?.addEventListener('click', onCancelCollectionConflict);
  confirmSaveAsNewBtn?.addEventListener('click', () => void confirmSaveAsNew());
  cancelSaveAsNewBtn?.addEventListener('click', closeSaveAsNewDialog);
  saveAsNewNameInput?.addEventListener('input', clearSaveAsNewError);
  saveAsNewNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmSaveAsNew();
    }
  });

  bindGlobalEvents({
    onFsChange,
    onResize: () => {
      recomputeLayout();
    },
    onKeyDown,
    onGlobalKeyDown,
  });

  renderActiveCollectionName();
  updateCount();
  recomputeLayout();
  setTitlesHidden(false);
}






