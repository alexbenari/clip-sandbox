import {
  VIDEO_EXTS,
  isVideoFile,
  niceNum,
  filterAndSortFiles,
  computeBestGrid,
  validateOrderStrict,
  computeFsLayout,
} from './logic.js';

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

  let currentDirHandle = null;
  let selectedThumb = null;
  let dragSourceId = null;
  let idCounter = 0;

  // --- Fullscreen layout lock & randomizer state ---
  let layoutLock = null; // when set, computeGrid keeps exact cols/height
  let fsSlots = 12; // total slots in fullscreen (last slot empty)
  let fsHidden = []; // elements hidden in fullscreen
  let fsDigitBuffer = '';
  let fsDigitTimer = null;
  let fsRandInterval = null;
  let fsRandPending = false;
  let savedTitleHiddenForFS = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showStatus(msg, timeout = 2500) {
    statusBar.textContent = msg;
    statusBar.hidden = false;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => (statusBar.hidden = true), timeout);
  }

  function updateCount() {
    const n = grid.children.length;
    countSpan.textContent = n === 1 ? '1 clip' : `${niceNum(n)} clips`;
    saveBtn.disabled = n === 0;
  }

  function clearGrid() {
    for (const el of Array.from(grid.children)) {
      const url = el.dataset.objectUrl;
      if (url) URL.revokeObjectURL(url);
    }
    grid.innerHTML = '';
    selectedThumb = null;
    updateCount();
  }

  function inTopLevelWindow() {
    try {
      return window.top === window.self;
    } catch {
      return false;
    }
  }
  function canUseDirectoryPicker() {
    return !!(window.isSecureContext && inTopLevelWindow() && 'showDirectoryPicker' in window);
  }

  async function pickFolder() {
    clearGrid();
    if (canUseDirectoryPicker()) {
      try {
        currentDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const files = [];
        for await (const entry of currentDirHandle.values()) {
          if (entry.kind === 'file') {
            try {
              const file = await entry.getFile();
              if (isVideoFile(file)) files.push(file);
            } catch {}
          }
        }
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
    const arr = filterAndSortFiles(fileList);
    if (arr.length === 0) {
      updateCount();
      computeGrid();
      return;
    }
    for (const file of arr) addThumbForFile(file);
    updateCount();
    await sleep(20);
    computeGrid();
    showStatus(`Loaded ${arr.length} video${arr.length === 1 ? '' : 's'}.`);
  }

  function addThumbForFile(file) {
    const id = `vid_${++idCounter}`;
    const url = URL.createObjectURL(file);

    const card = document.createElement('div');
    card.className = 'thumb';
    card.tabIndex = 0;
    card.id = id;
    card.draggable = true;
    card.dataset.name = file.name;
    card.dataset.objectUrl = url;

    const vid = document.createElement('video');
    vid.src = url;
    vid.loop = true;
    vid.autoplay = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'metadata';
    vid.addEventListener(
      'canplay',
      () => {
        vid.play().catch(() => {});
      },
      { once: true }
    );

    const name = document.createElement('div');
    name.className = 'filename';
    name.title = file.name;
    name.textContent = file.name;

    card.appendChild(vid);
    card.appendChild(name);
    grid.appendChild(card);

    card.addEventListener('click', () => {
      if (selectedThumb && selectedThumb !== card) selectedThumb.classList.remove('selected');
      selectedThumb = card;
      card.classList.toggle('selected');
      if (!card.classList.contains('selected')) selectedThumb = null;
    });

    card.addEventListener('dragstart', (e) => {
      dragSourceId = card.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.id);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragSourceId = null;
      removeDragOverClasses();
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const t = e.currentTarget;
      if (!dragSourceId || t.id === dragSourceId) return;
      t.classList.add('drag-over');
    });
    card.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const t = e.currentTarget;
      t.classList.remove('drag-over');
      const srcId = e.dataTransfer.getData('text/plain') || dragSourceId;
      const srcEl = document.getElementById(srcId);
      if (!srcEl || srcEl === t) return;
      const rect = t.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      if (before) grid.insertBefore(srcEl, t);
      else grid.insertBefore(srcEl, t.nextSibling);
      computeGrid();
    });
  }

  function removeDragOverClasses() {
    for (const el of grid.children) el.classList.remove('drag-over');
  }

  function computeGrid() {
    if (layoutLock) {
      grid.style.gridTemplateColumns = `repeat(${layoutLock.cols}, 1fr)`;
      for (const el of grid.children) el.style.height = `${layoutLock.cellH}px`;
      return;
    }
    const n = grid.children.length;
    if (n === 0) {
      grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
      return;
    }
    const wrapStyles = getComputedStyle(grid);
    const gap = parseFloat(wrapStyles.gap) || 0;
    const toolbarRect = toolbar.getBoundingClientRect();
    const availW = gridWrap.clientWidth;
    const availH = window.innerHeight - Math.ceil(toolbarRect.height) - 28;
    const { cols, cellH } = computeBestGrid({ count: n, availW, availH, gap });
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const el of grid.children) el.style.height = `${cellH}px`;
  }

  function getOrderArray() {
    return Array.from(grid.children)
      .map((el) => el.dataset.name)
      .filter(Boolean);
  }

  function applyOrder(names) {
    const map = new Map();
    Array.from(grid.children).forEach((el) => map.set(el.dataset.name, el));
    const frag = document.createDocumentFragment();
    for (const n of names) {
      const el = map.get(n);
      if (el) frag.appendChild(el);
    }
    grid.appendChild(frag);
    computeGrid();
    showStatus('Order applied.');
  }

  async function saveOrder() {
    const names = getOrderArray();
    const text = names.join('\n') + '\n';
    if (currentDirHandle && currentDirHandle.kind === 'directory' && currentDirHandle.getFileHandle) {
      try {
        const fh = await currentDirHandle.getFileHandle('clip-order.txt', { create: true });
        const writable = await fh.createWritable();
        await writable.write(text);
        await writable.close();
        showStatus('Saved clip-order.txt to the selected folder.');
        return;
      } catch (err) {
        console.warn('Direct save failed, falling back to download.', err);
      }
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clip-order.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showStatus('Downloaded clip-order.txt.');
  }

  function setTitlesHidden(hidden) {
    body.classList.toggle('titles-hidden', hidden);
    toggleTitlesBtn.textContent = hidden ? 'Show Titles' : 'Hide Titles';
  }

  async function enterFullScreen() {
    try {
      savedTitleHiddenForFS = body.classList.contains('titles-hidden');
      setTitlesHidden(true);
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      fsBtn.textContent = 'Exit Full Screen';
      computeGrid();
    } catch (e) {
      console.warn(e);
    }
  }
  async function exitFullScreen() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {
      console.warn(e);
    }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function onGlobalKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (key === 'f' || key === 'F') {
      if (!isFullscreen()) enterFullScreen();
      else exitFullScreen();
      e.preventDefault();
      return;
    }
    if (!isFullscreen()) return;
    if (key >= '0' && key <= '9') {
      fsDigitBuffer += key;
      clearTimeout(fsDigitTimer);
      fsDigitTimer = setTimeout(() => {
        const v = parseInt(fsDigitBuffer, 10);
        fsDigitBuffer = '';
        if (!Number.isNaN(v)) {
          fsSlots = Math.max(2, v);
          fsApplySlots();
          showStatus('Fullscreen slots: ' + fsSlots + ' (showing ' + Math.max(0, fsSlots - 1) + ')', 1500);
        }
      }, 600);
      e.preventDefault();
      return;
    }
  }

  function onKeyDown(e) {
    if (!selectedThumb) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const toRemove = selectedThumb;
      selectedThumb = null;
      URL.revokeObjectURL(toRemove.dataset.objectUrl);
      toRemove.remove();
      updateCount();
      computeGrid();
      showStatus('Clip removed from view.');
      e.preventDefault();
    }
  }

  pickBtn.addEventListener('click', pickFolder);
  folderInput.addEventListener('change', (e) => {
    currentDirHandle = null;
    clearGrid();
    loadFiles(e.target.files);
  });
  saveBtn.addEventListener('click', saveOrder);

  loadOrderBtn.addEventListener('click', () => {
    if (typeof orderFileInput.showPicker === 'function') orderFileInput.showPicker();
    else orderFileInput.click();
  });
  orderFileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      f.text()
        .then((t) => {
          const lines = t.replace(/\r/g, '').split('\n');
          const { issues, order } = validateOrderStrict(lines, getOrderArray());
          if (issues.length) {
            alert('Could not apply order due to the following issues:\n\n' + issues.join('\n\n'));
            return;
          }
          applyOrder(order);
        })
        .catch((err) => alert('Failed to read order file: ' + (err?.message || err)));
    }
    e.target.value = '';
  });

  toggleTitlesBtn.addEventListener('click', () => setTitlesHidden(!body.classList.contains('titles-hidden')));
  fsBtn.addEventListener('click', () => {
    if (!isFullscreen()) enterFullScreen();
    else exitFullScreen();
  });

  function fsComputeAndApplyGrid() {
    const gap = parseFloat(getComputedStyle(grid).gap) || 0;
    const availW = gridWrap.clientWidth;
    const availH = window.innerHeight - 28; // account for padding
    const best = computeFsLayout({ slots: fsSlots, availW, availH, gap });
    grid.style.gridTemplateColumns = `repeat(${best.cols}, 1fr)`;
    for (const el of grid.children) el.style.height = `${best.cellH}px`;
    return best;
  }
  function fsApplySlots() {
    if (fsHidden.length) {
      fsHidden.forEach((el) => (el.style.display = ''));
      fsHidden = [];
    }
    const best = fsComputeAndApplyGrid();
    const children = Array.from(grid.children);
    const total = children.length;
    if (total === 0) return;
    const targetVisible = Math.max(1, Math.min(total, best.targetVisible)); // keep last slot empty
    let toHide = Math.max(0, total - targetVisible);
    for (let i = 0; i < total; i++) {
      const el = children[i];
      if (i === total - 1) {
        el.style.display = '';
        continue;
      }
      if (toHide > 0) {
        el.style.display = 'none';
        fsHidden.push(el);
        toHide--;
      } else {
        el.style.display = '';
      }
    }
  }

  function fsRestoreAndUnlock() {
    if (fsHidden.length) {
      fsHidden.forEach((el) => (el.style.display = ''));
      fsHidden = [];
    }
    layoutLock = null;
  }

  function startFsRandomizer() {
    if (fsRandInterval) return;
    fsRandInterval = setInterval(() => {
      if (isFullscreen()) randomizeOnce();
    }, 3000);
  }
  function stopFsRandomizer() {
    if (fsRandInterval) {
      clearInterval(fsRandInterval);
      fsRandInterval = null;
    }
    fsRandPending = false;
  }
  function currentVisibleCards() {
    return Array.from(grid.children).filter((el) => el.style.display !== 'none');
  }
  function currentHiddenCards() {
    return Array.from(grid.children).filter((el) => el.style.display === 'none');
  }
  function waitForEnd(vid) {
    return new Promise((res) => {
      const h = () => {
        vid.removeEventListener('ended', h);
        res();
      };
      vid.addEventListener('ended', h, { once: true });
    });
  }
  function swapCardContents(a, b) {
    const va = a.querySelector('video'),
      vb = b.querySelector('video');
    const na = a.dataset.name,
      nb = b.dataset.name;
    const ua = a.dataset.objectUrl,
      ub = b.dataset.objectUrl;
    a.dataset.name = nb;
    b.dataset.name = na;
    a.dataset.objectUrl = ub;
    b.dataset.objectUrl = ua;
    const fa = a.querySelector('.filename'),
      fb = b.querySelector('.filename');
    fa.textContent = nb;
    fa.title = nb;
    fb.textContent = na;
    fb.title = na;
    va.pause();
    vb.pause();
    va.src = ub;
    vb.src = ua;
    va.loop = true;
    vb.loop = true;
    va.muted = true;
    vb.muted = true;
    va.play().catch(() => {});
  }
  function randomizeOnce() {
    if (!isFullscreen() || fsRandPending) return;
    const vis = currentVisibleCards();
    const hid = currentHiddenCards();
    if (vis.length <= 1 || hid.length === 0) return;
    const maxIndex = vis.length - 1;
    const idx = Math.floor(Math.random() * (maxIndex + 1));
    const targetCard = vis[idx];
    const replCard = hid[Math.floor(Math.random() * hid.length)];
    const v = targetCard.querySelector('video');
    fsRandPending = true;
    v.loop = false;
    waitForEnd(v)
      .then(() => {
        swapCardContents(targetCard, replCard);
        replCard.style.display = 'none';
        targetCard.style.display = '';
        const v2 = targetCard.querySelector('video');
        v2.loop = true;
        v2.play().catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        fsRandPending = false;
      });
  }

  function onFsChange() {
    const active = isFullscreen();
    body.classList.toggle('fs-active', active);
    if (!active) {
      fsRestoreAndUnlock();
      stopFsRandomizer();
      if (savedTitleHiddenForFS !== null) {
        setTitlesHidden(savedTitleHiddenForFS);
        savedTitleHiddenForFS = null;
      }
      fsBtn.textContent = 'Full Screen';
    } else {
      fsApplySlots();
      startFsRandomizer();
      fsBtn.textContent = 'Exit Full Screen';
    }
    computeGrid();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  window.addEventListener('resize', () => {
    if (isFullscreen()) fsApplySlots();
    else computeGrid();
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', onGlobalKeyDown);

  updateCount();
  computeGrid();
  setTitlesHidden(false);
}

// auto-init in browser
// Skip auto-init during Vitest to avoid side effects; tests call initApp manually.
if (typeof window !== 'undefined' && !globalThis.VITEST) {
  const start = () => initApp();
  const ready = document.readyState === 'complete' || document.readyState === 'interactive';
  const hasRootElements = () =>
    document.getElementById('pickBtn') && document.getElementById('folderInput') && document.getElementById('grid');
  if (ready && hasRootElements()) start();
  else
    window.addEventListener('DOMContentLoaded', () => {
      if (hasRootElements()) start();
    });
}
