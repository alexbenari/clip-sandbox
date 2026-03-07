import {
  isVideoFile,
  niceNum,
  filterAndSortFiles,
  computeBestGrid,
  validateOrderStrict,
  computeFsLayout,
  formatLabel,
  normalizeFsSlots,
} from '../../logic.js';
import { createAppState, nextThumbId, setSelectedThumb, setCurrentDirHandle, setFsSlots } from '../state/app-state.js';
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
import { runApplyOrder } from '../business-logic/apply-order.js';
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
import { fullscreenSlotsText, loadedVideosText, orderApplyErrorText } from '../ui/view-model.js';
import { createLayoutController } from '../ui/layout-controller.js';
import { createThumbInteractionHandlers } from '../ui/drag-drop-controller.js';
import { createOrderFileController } from '../ui/order-file-controller.js';

let initialized = false;

export function initApp() {
  if (initialized) return;
  initialized = true;
  'use strict';

  const pickBtn = document.getElementById('pickBtn');
  const saveBtn = document.getElementById('saveBtn');
  const folderInput = document.getElementById('folderInput');
  const orderFileInput = document.getElementById('orderFileInput');
  const loadOrderBtn = document.getElementById('loadOrderBtn');
  const grid = document.getElementById('grid');
  const gridWrap = document.getElementById('gridWrap');
  const countSpan = document.getElementById('count');
  const toolbar = document.getElementById('toolbar');
  const statusBar = document.getElementById('status');
  const toggleTitlesBtn = document.getElementById('toggleTitlesBtn');
  const fsBtn = document.getElementById('fsBtn');
  const body = document.body;

  const state = createAppState();

  function showStatus(msg, timeout = 2500) {
    showStatusAdapter(statusBar, msg, timeout);
  }

  function updateCount() {
    const n = grid.children.length;
    updateClipCount(countSpan, saveBtn, n, niceNum);
  }

  function clearGrid() {
    clearGridCards(grid);
    setSelectedThumb(state, null);
    updateCount();
  }

  async function pickFolder() {
    clearGrid();
    if (canUseDirectoryPicker()) {
      try {
        setCurrentDirHandle(state, await pickDirectory());
        const files = (await readFilesFromDirectory(state.currentDirHandle)).filter(isVideoFile);
        const sorted = filterAndSortFiles(files);
        if (sorted.length === 0) showStatus('No video files found in the selected folder.');
        await loadFiles(sorted);
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

  async function loadFiles(fileList) {
    await runLoadClips({
      fileList,
      filterAndSortFiles,
      addThumbForFile,
      updateCount,
      recomputeLayout,
      showStatus,
      delay,
      buildLoadedMessage: loadedVideosText,
    });
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
  });

  function getOrderArray() {
    return Array.from(grid.children)
      .map((el) => el.dataset.name)
      .filter(Boolean);
  }

  function applyOrder(names) {
    runApplyOrder({ names, grid, recomputeLayout, showStatus });
  }

  async function saveOrder() {
    await runSaveOrder({
      names: getOrderArray(),
      currentDirHandle: state.currentDirHandle,
      saveTextToDirectory,
      downloadText,
      showStatus,
    });
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

  function onGlobalKeyDown(e) {
    fullscreenSession.onGlobalKeyDown(e);
  }

  function onKeyDown(e) {
    if (isEditableTarget(e.target)) return;
    if (!(e.key === 'Delete' || e.key === 'Backspace')) return;
    const removed = runRemoveSelectedClip({
      selectedThumb: state.selectedThumb,
      clearSelection: () => setSelectedThumb(state, null),
      updateCount,
      recomputeLayout,
      showStatus,
    });
    if (removed) e.preventDefault();
  }

  function onFolderInputChange(e) {
    setCurrentDirHandle(state, null);
    clearGrid();
    void loadFiles(e.target.files);
  }

  const orderFileController = createOrderFileController({
    orderFileInput,
    validateOrderStrict,
    getOrderArray,
    applyOrder,
    orderApplyErrorText,
  });

  function onLoadOrderClick() {
    orderFileController.onLoadOrderClick();
  }

  function onOrderFileChange(e) {
    orderFileController.onOrderFileChange(e);
  }

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
    loadOrderBtn,
    orderFileInput,
    toggleTitlesBtn,
    fsBtn,
    onPickFolder: () => void pickFolder(),
    onFolderInputChange,
    onSaveOrder: () => void saveOrder(),
    onLoadOrderClick,
    onOrderFileChange,
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

  updateCount();
  recomputeLayout();
  setTitlesHidden(false);
}
