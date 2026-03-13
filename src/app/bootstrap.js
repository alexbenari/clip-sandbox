import {
  isVideoFile,
  niceNum,
  filterAndSortFiles,
  formatLabel,
} from '../domain/clip-rules.js';
import {
  computeBestGrid,
  computeFsLayout,
  normalizeFsSlots,
} from '../domain/layout-rules.js';
import { analyzeCollectionEntries } from '../domain/order-rules.js';
import {
  createAppState,
  nextThumbId,
  setSelectedThumb,
  setCurrentDirHandle,
  setFolderFiles,
  setActiveCollectionName,
  setActiveCollectionNames,
  setPendingCollectionConflict,
  resetCollectionState,
  setFsSlots,
} from '../state/app-state.js';
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
import { runLoadClips } from '../business-logic/load-clips.js';
import { runSaveOrder } from '../business-logic/save-order.js';
import { runRemoveSelectedClip } from '../business-logic/remove-clip.js';
import { runToggleTitles } from '../business-logic/toggle-titles.js';
import { createFullscreenSession } from '../business-logic/fullscreen-session.js';
import {
  createThumbCard,
  clearGridCards,
  removeDragOverClasses,
  setCardDuration,
  updateCardLabel,
} from '../ui/dom-factory.js';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from '../ui/events.js';
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
} from '../ui/view-model.js';
import { createLayoutController } from '../ui/layout-controller.js';
import { createThumbInteractionHandlers } from '../ui/drag-drop-controller.js';
import { createOrderFileController } from '../ui/order-file-controller.js';
import { createOrderMenuController } from '../ui/order-menu-controller.js';

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

  function renderActiveCollectionName() {
    const text = activeCollectionText(state.activeCollectionName);
    document.title = activeCollectionTabText(state.activeCollectionName);
    if (activeCollectionNameEl) {
      activeCollectionNameEl.textContent = text;
      activeCollectionNameEl.title = text;
    }
  }

  function updateCount() {
    const n = grid.children.length;
    updateClipCount(countSpan, [saveBtn, saveAsNewBtn], n, niceNum);
  }

  function clearGrid() {
    clearGridCards(grid);
    setSelectedThumb(state, null);
    updateCount();
  }

  function hideCollectionConflict() {
    if (collectionConflict) collectionConflict.hidden = true;
    if (collectionConflictSummary) collectionConflictSummary.textContent = '';
    if (collectionConflictList) collectionConflictList.textContent = '';
  }

  function showCollectionConflictPanel(conflict) {
    setPendingCollectionConflict(state, conflict);
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

  function resetLoadedCollectionView() {
    hideCollectionConflict();
    closeSaveAsNewDialog();
    clearGrid();
    resetCollectionState(state);
    renderActiveCollectionName();
  }

  function currentGridNames() {
    return Array.from(grid.children)
      .map((el) => el.dataset.name)
      .filter(Boolean);
  }

  function syncActiveCollectionFromGrid(source = 'ui-edited') {
    setActiveCollectionNames(state, currentGridNames(), source);
  }

  function addThumbForFile(file) {
    const id = nextThumbId(state);
    const card = createThumbCard({
      file,
      id,
      formatLabel,
      onLoadedMetadata: (el, vid) => setCardDuration(el, vid.duration, formatLabel),
      onSelect: thumbInteractions.onSelect,
      onDragStart: thumbInteractions.onDragStart,
      onDragEnd: thumbInteractions.onDragEnd,
      onDragOver: thumbInteractions.onDragOver,
      onDragLeave: thumbInteractions.onDragLeave,
      onDrop: thumbInteractions.onDrop,
    });
    grid.appendChild(card);
  }

  function renderActiveCollection() {
    const filesByName = new Map(state.folderFiles.map((file) => [file.name, file]));
    clearGrid();
    for (const name of state.activeCollectionNames) {
      const file = filesByName.get(name);
      if (file) addThumbForFile(file);
    }
    updateCount();
    recomputeLayout();
  }

  function applyCollection(names, source, statusText, timeout = 2500, collectionName = state.activeCollectionName) {
    hideCollectionConflict();
    setPendingCollectionConflict(state, null);
    setActiveCollectionNames(state, names, source);
    setActiveCollectionName(state, normalizedCollectionName(collectionName, state.activeCollectionName));
    renderActiveCollection();
    renderActiveCollectionName();
    showStatus(statusText, timeout);
  }

  async function pickFolder() {
    resetLoadedCollectionView();
    if (canUseDirectoryPicker()) {
      try {
        setCurrentDirHandle(state, await pickDirectory());
        const files = (await readFilesFromDirectory(state.currentDirHandle)).filter(isVideoFile);
        const sorted = filterAndSortFiles(files);
        if (sorted.length === 0) showStatus('No video files found in the selected folder.');
        await loadFiles(sorted, implicitCollectionName(state.currentDirHandle?.name));
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

  async function loadFiles(fileList, collectionName = DEFAULT_ACTIVE_COLLECTION_NAME) {
    const loadedFiles = [];
    const count = await runLoadClips({
      fileList,
      filterAndSortFiles,
      addThumbForFile: (file) => {
        loadedFiles.push(file);
        addThumbForFile(file);
      },
      updateCount,
      recomputeLayout,
      showStatus,
      delay,
      buildLoadedMessage: loadedVideosText,
    });
    setFolderFiles(state, loadedFiles);
    setActiveCollectionNames(state, loadedFiles.map((file) => file.name), 'implicit-folder');
    setActiveCollectionName(state, loadedFiles.length > 0 ? implicitCollectionName(collectionName) : '');
    setPendingCollectionConflict(state, null);
    hideCollectionConflict();
    renderActiveCollectionName();
    return count;
  }

  function applyGridLayout(cols, cellH) {
    applyGridLayoutAdapter(grid, cols, cellH);
  }

  function isFullscreen() {
    return isFullScreenActive(document);
  }

  const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = createLayoutController({
    grid,
    gridWrap,
    toolbar,
    state,
    computeBestGrid,
    computeFsLayout,
    applyGridLayout,
    isFullscreen,
  });

  const thumbInteractions = createThumbInteractionHandlers({
    state,
    grid,
    setSelectedThumb,
    recomputeLayout,
    removeDragOverClasses,
    onCollectionReordered: (names) => setActiveCollectionNames(state, names, 'ui-edited'),
  });

  async function saveCollection(filename = 'default-collection.txt') {
    await runSaveOrder({
      names: state.activeCollectionNames,
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
    setActiveCollectionName(state, collectionNameFromFilename(filename));
    renderActiveCollectionName();
    closeSaveAsNewDialog();
  }

  function setTitlesHidden(hidden) {
    runToggleTitles({ body, toggleBtn: toggleTitlesBtn, hidden });
  }

  const fullscreenSession = createFullscreenSession({
    state,
    grid,
    body,
    fsBtn,
    setTitlesHidden,
    enterFullScreenAdapter,
    exitFullScreenAdapter,
    isFullscreen,
    fsApplySlots,
    fsRestore,
    computeGrid,
    showStatus,
    setFsSlots,
    normalizeFsSlots,
    fullscreenSlotsText,
    every,
    clearClock,
    updateCardLabel,
    formatLabel,
  });

  function handleCollectionLines(lines, file) {
    const analysis = analyzeCollectionEntries(lines, state.folderFileNames);
    const collectionName = collectionNameFromFilename(file?.name);
    if (analysis.kind === 'invalid-empty') {
      showStatus(collectionEmptyErrorText(), 4000);
      return;
    }
    if (analysis.kind === 'invalid-duplicates') {
      showStatus(collectionDuplicateErrorText(analysis.duplicateNames), 4500);
      return;
    }
    if (analysis.kind === 'has-missing') {
      showCollectionConflictPanel({ ...analysis, collectionName });
      return;
    }
    applyCollection(
      analysis.requestedNames,
      'collection-file',
      collectionLoadedText(analysis.requestedNames.length),
      2500,
      collectionName
    );
  }

  const orderFileController = createOrderFileController({
    orderFileInput,
    canLoadCollection: () => state.folderFileNames.length > 0,
    onCollectionLines: handleCollectionLines,
    showStatus,
    collectionFirstUnavailableText,
    collectionReadErrorText,
  });

  function onLoadOrderClick() {
    orderFileController.onLoadOrderClick();
  }

  function onOrderFileChange(e) {
    orderFileController.onOrderFileChange(e);
  }

  function onApplyCollectionConflict() {
    const conflict = state.pendingCollectionConflict;
    hideCollectionConflict();
    setPendingCollectionConflict(state, null);
    if (!conflict) return;
    if (conflict.existingNamesInOrder.length === 0) {
      showStatus(noCollectionMatchesText(conflict.missingCount), 4500);
      return;
    }
    applyCollection(
      conflict.existingNamesInOrder,
      'partial-collection-after-missing-filter',
      collectionPartiallyLoadedText(conflict.existingNamesInOrder.length, conflict.missingCount),
      4000,
      conflict.collectionName
    );
  }

  function onCancelCollectionConflict() {
    hideCollectionConflict();
    setPendingCollectionConflict(state, null);
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
    if (isEditableTarget(e.target)) return;
    if (!(e.key === 'Delete' || e.key === 'Backspace')) return;
    const removed = runRemoveSelectedClip({
      selectedThumb: state.selectedThumb,
      clearSelection: () => setSelectedThumb(state, null),
      updateCount,
      recomputeLayout,
      showStatus,
    });
    if (removed) {
      syncActiveCollectionFromGrid('ui-edited');
      e.preventDefault();
    }
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
    setTitlesHidden(!body.classList.contains('titles-hidden'));
  }

  function onFsToggle() {
    fullscreenSession.onFsToggle();
  }

  function onFsChange() {
    fullscreenSession.onFsChange();
  }

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







