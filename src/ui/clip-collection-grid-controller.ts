// @ts-nocheck
import { createGridVideoMetadataTracker } from './grid-video-metadata-tracker.js';

const CLIP_COLLECTION_GRID_STYLE_ID = 'clipCollectionGridStyles';
const DEFAULT_CLIP_COLLECTION_GRID_CSS = `
.clip-collection-grid-root{
  height: calc(100vh - 60px);
  padding:14px;
  overflow:auto;
}
.clip-collection-grid{
  display:grid;
  grid-auto-flow:dense;
  gap:var(--gap);
  grid-template-columns: repeat(1, 1fr);
  align-content:start;
}
.clip-collection-grid .thumb{
  display:flex;
  align-items:center;
  justify-content:center;
  background:linear-gradient(180deg, #0f172a, #0b1222);
  border:1px solid rgba(148,163,184,.16);
  border-radius:var(--radius);
  position:relative;
  overflow:hidden;
  user-select:none;
  box-shadow: var(--shadow);
  transition: height 140ms ease;
}
.clip-collection-grid .thumb.selected{ box-shadow: 0 0 0 3px rgba(122,162,247,.65), var(--shadow); }
.clip-collection-grid .thumb.dragging{ opacity:.65; }
.clip-collection-grid .thumb.drag-over::after{ content:""; position:absolute; inset:0; border:2px dashed var(--accent); border-radius:var(--radius); pointer-events:none; }
.clip-collection-grid .thumb > video{ max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; background:black; display:block; border-radius:10px; }
.clip-collection-grid .filename{ position:absolute; left:0; right:0; bottom:0; font-size:12px; line-height:1.3; color:#d1d5db; padding:6px 8px; background:linear-gradient(180deg, rgba(2,6,23,0), rgba(2,6,23,.75)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.clip-collection-grid-root.titles-hidden .filename{ display:none; }
`;

export const PLACEHOLDER_DURATION = '--:--:--';

function ensureClipCollectionGridStyles(doc) {
  if (doc.getElementById(CLIP_COLLECTION_GRID_STYLE_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = CLIP_COLLECTION_GRID_STYLE_ID;
  styleEl.textContent = DEFAULT_CLIP_COLLECTION_GRID_CSS;
  (doc.head || doc.documentElement).appendChild(styleEl);
}

export function updateCardLabel(card, formatLabel) {
  if (!card) return;
  const label = card.querySelector('.filename');
  if (!label) return;
  const name = card.dataset.name || '';
  const duration = Number.parseFloat(card.dataset.durationSeconds);
  const text = formatLabel(name, Number.isFinite(duration) ? duration : null);
  label.textContent = text;
  label.title = text;
}

function setCardDuration(card, seconds, formatLabel) {
  if (!card) return;
  if (Number.isFinite(seconds)) card.dataset.durationSeconds = seconds;
  else card.dataset.durationSeconds = '';
  updateCardLabel(card, formatLabel);
}

function clearGridCards(grid) {
  for (const el of Array.from(grid.children)) {
    const url = el.dataset.objectUrl;
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  grid.innerHTML = '';
}

function startPreviewPlayback(video) {
  try {
    const result = video?.play?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Preview playback is best-effort; unsupported test/browser media APIs should not break rendering.
  }
}

const gridPreviewPlaybackTokens = new WeakMap();

function cancelGridPreviewPlayback(grid) {
  if (!grid) return;
  gridPreviewPlaybackTokens.set(grid, (gridPreviewPlaybackTokens.get(grid) || 0) + 1);
}

function scheduleGridPreviewPlayback(grid) {
  const view = grid?.ownerDocument?.defaultView || window;
  const token = (gridPreviewPlaybackTokens.get(grid) || 0) + 1;
  gridPreviewPlaybackTokens.set(grid, token);
  const batchSize = 1;
  const batchDelayMs = 120;

  const schedule = (callback, delay = 0) => {
    if (delay > 0) {
      view.setTimeout?.(callback, delay);
      return;
    }
    if (typeof view?.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(callback);
      return;
    }
    setTimeout(callback, 0);
  };

  const runBatch = (retryIndex = 0, startIndex = 0) => {
    if (gridPreviewPlaybackTokens.get(grid) !== token) return;
    const videos = Array.from(grid?.querySelectorAll?.('video') || []);
    const readyVideos = videos.filter((video) => video.readyState >= 2 && (video.paused || video.ended));
    const batch = readyVideos.slice(startIndex, startIndex + batchSize);
    for (const video of batch) startPreviewPlayback(video);

    const nextIndex = startIndex + batch.length;
    if (readyVideos.length > nextIndex) {
      schedule(() => runBatch(retryIndex, nextIndex), batchDelayMs);
      return;
    }

    const retryDelays = [800];
    const delay = retryDelays[retryIndex];
    if (delay !== undefined) schedule(() => runBatch(retryIndex + 1, 0), delay);
  };

  schedule(() => schedule(() => runBatch()));
}

function copyGridSurfaceAttributes(from, to) {
  to.className = from?.className || 'clip-collection-grid';
  to.style.cssText = from?.style?.cssText || '';
}

function showGridSurface(grid) {
  if (!grid) return;
  grid.style.display = '';
  grid.style.position = '';
  grid.style.visibility = '';
  grid.style.opacity = '';
  grid.style.pointerEvents = '';
  grid.style.inset = '';
  grid.inert = false;
  grid.removeAttribute('aria-hidden');
}

function hideGridSurface(grid) {
  if (!grid) return;
  grid.style.display = '';
  grid.style.position = 'absolute';
  grid.style.visibility = '';
  grid.style.opacity = '0';
  grid.style.pointerEvents = 'none';
  grid.style.inset = '0';
  grid.inert = true;
  grid.setAttribute('aria-hidden', 'true');
}

function clipSequenceSignature(collection) {
  return (collection?.orderedClips?.() || []).map((clip) => clip.id).join('\n');
}

function removeDragOverClasses(grid) {
  for (const el of grid.children) el.classList.remove('drag-over');
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  return !!editable;
}

function createThumbCard({
  doc = document,
  clip,
  cardId,
  mediaSource,
  formatLabel,
  onSelect,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onLoadedMetadata,
  onMetadataError,
  metadataToken,
}) {
  const card = doc.createElement('div');
  card.className = 'thumb';
  card.tabIndex = 0;
  card.id = cardId;
  card.draggable = true;
  card.dataset.clipId = clip.id;
  card.dataset.name = clip.name;
  card.dataset.objectUrl = mediaSource;
  card.dataset.durationSeconds = Number.isFinite(clip.durationSec) ? clip.durationSec : '';

  const vid = doc.createElement('video');
  vid.src = mediaSource;
  vid.loop = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  vid.addEventListener(
    'canplay',
    () => {
      startPreviewPlayback(vid);
    },
    { once: true }
  );

  const name = doc.createElement('div');
  name.className = 'filename';
  const text = formatLabel(clip.name, Number.isFinite(clip.durationSec) ? clip.durationSec : null);
  name.title = text;
  name.textContent = text;

  card.appendChild(vid);
  card.appendChild(name);

  vid.addEventListener('loadedmetadata', () => {
    onLoadedMetadata(card, vid, clip, metadataToken);
    startPreviewPlayback(vid);
  });
  vid.addEventListener('error', () => onMetadataError(card, vid, clip, metadataToken));
  card.addEventListener('click', (event) => onSelect(card, event));
  card.addEventListener('dblclick', () => onDoubleClick?.(card));
  card.addEventListener('dragstart', (e) => onDragStart(card, e));
  card.addEventListener('dragend', () => onDragEnd(card));
  card.addEventListener('dragover', (e) => onDragOver(card, e));
  card.addEventListener('dragleave', () => onDragLeave(card));
  card.addEventListener('drop', (e) => onDrop(card, e));

  return card;
}

export function formatDuration(seconds) {
  const total = Math.round(Math.max(0, Number(seconds)));
  if (!Number.isFinite(total)) return PLACEHOLDER_DURATION;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatLabel(name, durationSeconds) {
  const hasDuration = Number.isFinite(durationSeconds);
  const formatted = hasDuration ? formatDuration(durationSeconds) : PLACEHOLDER_DURATION;
  return `${name} (${formatted})`;
}

export class ClipCollectionGridController {
  constructor(options = {}) {
    this.grid = options.grid;
    this.gridRoot = options.gridRoot ?? this.grid?.parentElement ?? null;
    this.toolbar = options.toolbar ?? null;
    this.fullscreenState = options.fullscreenState ?? null;
    this.formatClipLabel = options.formatLabel ?? formatLabel;
    this.computeBestGridFn = options.computeBestGrid ?? null;
    this.computeFsLayoutFn = options.computeFsLayout ?? null;
    this.applyGridLayoutFn = options.applyGridLayout ?? null;
    this.isFullscreen = options.isFullscreen ?? null;
    this.onMetadataFailure = options.onMetadataFailure ?? null;
    this.updateCount = options.updateCount;
    this.onSelectionChange = options.onSelectionChange;
    this.onOrderChange = options.onOrderChange;
    this.onOpenClip = options.onOpenClip;
    this.onRemoveSelected = options.onRemoveSelected;
    this.onContextMenu = options.onContextMenu;
    this.doc = this.grid?.ownerDocument || document;
    this.currentCollection = null;
    this.selectedClipIds = new Set();
    this.dragSourceCardId = null;
    this.hiddenCards = [];
    this.currentAppliedCols = null;
    this.pendingMetadataRelayout = false;
    this.activeCacheKey = null;
    this.gridViewCache = new Map();
    this.metadataTracker = options.metadataTracker ?? createGridVideoMetadataTracker({
      onComplete: () => this.onMetadataComplete(),
      onFailure: ({ clip, error }) => this.onMetadataFailure?.({ clip, error }),
      debounceMs: options.metadataRelayoutDebounceMs ?? 0,
    });

    this.renderCollection = this.renderCollection.bind(this);
    this.destroy = this.destroy.bind(this);
    this.clearSelection = this.clearSelection.bind(this);
    this.getSelectedClipId = this.getSelectedClipId.bind(this);
    this.getSelectedClipIds = this.getSelectedClipIds.bind(this);
    this.setSelectedClipId = this.setSelectedClipId.bind(this);
    this.getCardByClipId = this.getCardByClipId.bind(this);
    this.getClipById = this.getClipById.bind(this);
    this.getClipIdByName = this.getClipIdByName.bind(this);
    this.getClipMediaSource = this.getClipMediaSource.bind(this);
    this.getNextClip = this.getNextClip.bind(this);
    this.getPrevClip = this.getPrevClip.bind(this);
    this.getOrderedClipIds = this.getOrderedClipIds.bind(this);
    this.getCardCount = this.getCardCount.bind(this);
    this.getGridElement = this.getGridElement.bind(this);
    this.areTitlesHidden = this.areTitlesHidden.bind(this);
    this.setTitlesHidden = this.setTitlesHidden.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.recomputeLayout = this.recomputeLayout.bind(this);
    this.computeGrid = this.computeGrid.bind(this);
    this.fsApplySlots = this.fsApplySlots.bind(this);
    this.fsRestore = this.fsRestore.bind(this);
    this.onGridContextMenu = this.onGridContextMenu.bind(this);
    this.onMetadataComplete = this.onMetadataComplete.bind(this);
    this.invalidateView = this.invalidateView.bind(this);
    this.invalidateAllViews = this.invalidateAllViews.bind(this);
    this.retagActiveView = this.retagActiveView.bind(this);

    ensureClipCollectionGridStyles(this.doc);
    this.gridRoot?.classList.add('clip-collection-grid-root');
    this.grid?.classList.add('clip-collection-grid');
    this.gridRoot?.addEventListener('contextmenu', this.onGridContextMenu);
  }

  hiddenCardBuffer() {
    return this.fullscreenState?.hiddenCards || this.hiddenCards;
  }

  replaceHiddenCards(nextHiddenCards) {
    if (this.fullscreenState?.hiddenCards) this.fullscreenState.hiddenCards = nextHiddenCards;
    else this.hiddenCards = nextHiddenCards;
  }

  normalizedCacheKey(cacheKey) {
    const key = String(cacheKey || '').trim();
    return key || null;
  }

  createCacheEntry() {
    const container = this.doc.createElement('div');
    copyGridSurfaceAttributes(this.grid, container);
    return {
      container,
      collection: null,
      signature: '',
    };
  }

  setActiveGridElement(nextGrid) {
    if (!nextGrid || nextGrid === this.grid) {
      this.grid?.classList.add('clip-collection-grid');
      if (this.grid?.id !== 'grid') this.grid.id = 'grid';
      showGridSurface(this.grid);
      return;
    }
    if (this.grid?.id === 'grid') this.grid.removeAttribute('id');
    hideGridSurface(this.grid);
    nextGrid.id = 'grid';
    showGridSurface(nextGrid);
    nextGrid.classList.add('clip-collection-grid');
    this.grid = nextGrid;
  }

  createActiveGridElement() {
    const nextGrid = this.doc.createElement('div');
    copyGridSurfaceAttributes(this.grid, nextGrid);
    this.gridRoot?.appendChild(nextGrid);
    this.setActiveGridElement(nextGrid);
    return nextGrid;
  }

  stashActiveGrid() {
    if (!this.activeCacheKey || !this.currentCollection) return;
    let entry = this.gridViewCache.get(this.activeCacheKey);
    if (!entry) {
      entry = {
        container: this.grid,
        collection: null,
        signature: '',
      };
      this.gridViewCache.set(this.activeCacheKey, entry);
    }
    this.fsRestore();
    removeDragOverClasses(this.grid);
    cancelGridPreviewPlayback(this.grid);
    entry.collection = this.currentCollection;
    entry.signature = clipSequenceSignature(this.currentCollection);
    entry.container = this.grid;
    hideGridSurface(entry.container);
    if (entry.container.id === 'grid') entry.container.removeAttribute('id');
  }

  cachedEntryFor(cacheKey, collection) {
    const key = this.normalizedCacheKey(cacheKey);
    if (!key) return null;
    const entry = this.gridViewCache.get(key);
    if (!entry) return null;
    if (entry.signature !== clipSequenceSignature(collection)) {
      this.clearCacheEntry(entry);
      this.gridViewCache.delete(key);
      return null;
    }
    return entry;
  }

  clearCacheEntry(entry) {
    if (!entry) return;
    clearGridCards(entry.container);
    if (entry.container !== this.grid) entry.container.remove();
    entry.collection = null;
    entry.signature = '';
  }

  showCachedEntry(cacheKey, collection, entry, previousSelection) {
    this.currentCollection = collection || null;
    this.setActiveGridElement(entry.container);
    this.activeCacheKey = this.normalizedCacheKey(cacheKey);
    const orderedClips = this.currentCollection?.orderedClips?.() || [];
    this.metadataTracker.start(orderedClips);
    this.selectedClipIds = new Set(
      Array.from(previousSelection).filter((clipId) => this.currentCollection.hasClip(clipId))
    );
    this.applySelectionClasses();
    this.updateCount?.();
    this.recomputeLayout();
    this.notifySelectionChange();
    scheduleGridPreviewPlayback(this.grid);
  }

  invalidateView(cacheKey) {
    const key = this.normalizedCacheKey(cacheKey);
    if (!key) return;
    const entry = this.gridViewCache.get(key);
    if (entry) this.clearCacheEntry(entry);
    this.gridViewCache.delete(key);
  }

  invalidateAllViews() {
    for (const entry of this.gridViewCache.values()) {
      this.clearCacheEntry(entry);
    }
    this.gridViewCache.clear();
  }

  retagActiveView(cacheKey) {
    this.activeCacheKey = this.normalizedCacheKey(cacheKey);
  }

  readGridMetrics(mode) {
    const view = this.doc.defaultView || window;
    const gap = parseFloat(view.getComputedStyle(this.grid).gap) || 0;
    const availW = this.gridRoot?.clientWidth || this.grid?.clientWidth || 0;
    const toolbarHeight = this.toolbar ? Math.ceil(this.toolbar.getBoundingClientRect().height) : 0;
    const chromeH = mode === 'fullscreen' ? 28 : toolbarHeight + 28;
    const availH = view.innerHeight - chromeH;
    return { gap, availW, availH };
  }

  computeGrid() {
    const count = this.grid.children.length;
    if (count === 0) {
      this.grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
      this.currentAppliedCols = 1;
      return;
    }
    if (!this.computeBestGridFn || !this.applyGridLayoutFn) return;
    const { gap, availW, availH } = this.readGridMetrics('normal');
    const { cols, cellH } = this.computeBestGridFn({
      count,
      availW,
      availH,
      gap,
      clips: this.currentCollection?.orderedClips?.() || [],
    });
    const previousCols = Number.parseInt(this.grid.dataset.layoutCols || '', 10);
    const previousCellH = Number.parseFloat(this.grid.dataset.layoutCellHeight || '');
    if (previousCols === cols && Number.isFinite(previousCellH) && Math.abs(previousCellH - cellH) < 0.5) {
      this.currentAppliedCols = cols;
      return;
    }
    this.applyGridLayoutFn(cols, cellH);
    this.grid.dataset.layoutCols = String(cols);
    this.grid.dataset.layoutCellHeight = String(cellH);
    this.currentAppliedCols = cols;
  }

  recomputeGridIfColumnCountChanged() {
    const count = this.grid.children.length;
    if (count === 0 || !this.computeBestGridFn || !this.applyGridLayoutFn) return;
    const { gap, availW, availH } = this.readGridMetrics('normal');
    const { cols, cellH } = this.computeBestGridFn({
      count,
      availW,
      availH,
      gap,
      clips: this.currentCollection?.orderedClips?.() || [],
    });
    if (cols === this.currentAppliedCols) return;
    this.applyGridLayoutFn(cols, cellH);
    this.grid.dataset.layoutCols = String(cols);
    this.grid.dataset.layoutCellHeight = String(cellH);
    this.currentAppliedCols = cols;
  }

  onMetadataComplete() {
    if (this.isFullscreen?.()) return;
    if (this.dragSourceCardId) {
      this.pendingMetadataRelayout = true;
      return;
    }
    this.recomputeGridIfColumnCountChanged();
  }

  fsComputeAndApplyGrid() {
    if (!this.computeFsLayoutFn || !this.applyGridLayoutFn) {
      return { targetVisible: this.grid.children.length };
    }
    const { gap, availW, availH } = this.readGridMetrics('fullscreen');
    const best = this.computeFsLayoutFn({
      slots: this.fullscreenState?.slots,
      availW,
      availH,
      gap,
    });
    this.applyGridLayoutFn(best.cols, best.cellH);
    return best;
  }

  fsRestore() {
    const cardsToRestore = this.hiddenCardBuffer();
    if (cardsToRestore.length === 0) return;
    cardsToRestore.forEach((element) => {
      element.style.display = '';
    });
    this.replaceHiddenCards([]);
  }

  fsApplySlots() {
    this.fsRestore();
    const best = this.fsComputeAndApplyGrid();
    const children = Array.from(this.grid.children);
    const total = children.length;
    if (total === 0) return;

    const targetVisible = Math.max(1, Math.min(total, best.targetVisible));
    let toHide = Math.max(0, total - targetVisible);
    const nextHiddenCards = [];
    for (let i = 0; i < total; i += 1) {
      const element = children[i];
      if (i === total - 1) {
        element.style.display = '';
        continue;
      }
      if (toHide > 0) {
        element.style.display = 'none';
        nextHiddenCards.push(element);
        toHide -= 1;
      } else {
        element.style.display = '';
      }
    }
    this.replaceHiddenCards(nextHiddenCards);
  }

  recomputeLayout() {
    if (this.isFullscreen?.()) {
      this.fsApplySlots();
      return;
    }
    this.computeGrid();
  }

  notifySelectionChange() {
    this.onSelectionChange?.(this.getSelectedClipId(), this.getSelectedClipIds());
  }

  getSelectedClipId() {
    const selectedIds = this.getSelectedClipIds();
    return selectedIds.length === 1 ? selectedIds[0] : null;
  }

  getSelectedClipIds() {
    return this.getOrderedClipIds().filter((clipId) => this.selectedClipIds.has(clipId));
  }

  getCardByClipId(clipId) {
    if (!clipId) return null;
    return Array.from(this.grid.children).find((card) => card.dataset.clipId === clipId) || null;
  }

  getClipById(clipId) {
    return this.currentCollection?.getClip(clipId) || null;
  }

  getClipIdByName(name) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return null;
    return this.currentCollection?.orderedClips?.().find((clip) => clip.name === normalizedName)?.id || null;
  }

  getAdjacentClip(clipId, offset) {
    const currentCard = this.getCardByClipId(clipId);
    if (!currentCard) return null;
    const orderedCards = Array.from(this.grid.children);
    const currentIndex = orderedCards.indexOf(currentCard);
    if (currentIndex === -1) return null;
    const adjacentCard = orderedCards[currentIndex + offset];
    return this.getClipById(adjacentCard?.dataset.clipId || '');
  }

  getNextClip(clipId) {
    return this.getAdjacentClip(clipId, 1);
  }

  getPrevClip(clipId) {
    return this.getAdjacentClip(clipId, -1);
  }

  getOrderedClipIds() {
    return Array.from(this.grid.children)
      .map((card) => card.dataset.clipId)
      .filter(Boolean);
  }

  getCardCount() {
    return this.grid?.children?.length || 0;
  }

  getGridElement() {
    return this.grid;
  }

  areTitlesHidden() {
    return !!this.gridRoot?.classList.contains('titles-hidden');
  }

  setTitlesHidden(hidden) {
    this.gridRoot?.classList.toggle('titles-hidden', !!hidden);
  }

  applySelectionClasses() {
    for (const card of Array.from(this.grid.children)) {
      card.classList.toggle('selected', this.selectedClipIds.has(card.dataset.clipId));
    }
  }

  clearSelection() {
    this.selectedClipIds = new Set();
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  setSelectedClipId(clipId) {
    this.selectedClipIds = clipId ? new Set([clipId]) : new Set();
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  selectOnlyCard(card) {
    if (!card) {
      this.clearSelection();
      return;
    }
    this.selectedClipIds = new Set([card.dataset.clipId]);
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  toggleCardSelection(card) {
    const clipId = card?.dataset.clipId || '';
    if (!clipId) return;
    if (this.selectedClipIds.has(clipId)) this.selectedClipIds.delete(clipId);
    else this.selectedClipIds.add(clipId);
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  onSelect(card, event) {
    const clipId = card?.dataset.clipId || null;
    if (!clipId) {
      this.clearSelection();
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      this.toggleCardSelection(card);
      return;
    }
    this.selectOnlyCard(card);
  }

  onDoubleClick(card) {
    this.selectOnlyCard(card);
    const clipId = card?.dataset.clipId || null;
    if (clipId) this.onOpenClip?.(clipId);
  }

  onGridContextMenu(event) {
    if (!this.onContextMenu) return;
    event.preventDefault();
    const card = event.target instanceof Element ? event.target.closest('.thumb') : null;
    this.onContextMenu({
      card,
      point: { x: event.clientX, y: event.clientY },
      selectedClipId: this.getSelectedClipId(),
      selectedClipIds: this.getSelectedClipIds(),
      clipId: card?.dataset.clipId || null,
    });
  }

  handleKeyDown(event) {
    if (!this.onRemoveSelected) return false;
    if (!(event?.key === 'Delete' || event?.key === 'Backspace')) return false;
    if (isEditableTarget(event.target)) return false;
    const orderedSelectedClipIds = this.getSelectedClipIds();
    if (orderedSelectedClipIds.length === 0) return false;
    this.onRemoveSelected(orderedSelectedClipIds);
    event.preventDefault();
    return true;
  }

  onDragStart(card, event) {
    this.dragSourceCardId = card.id;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.id);
  }

  onDragEnd(card) {
    card.classList.remove('dragging');
    this.dragSourceCardId = null;
    removeDragOverClasses(this.grid);
    if (this.pendingMetadataRelayout) {
      this.pendingMetadataRelayout = false;
      this.onMetadataComplete();
    }
  }

  onDragOver(card, event) {
    event.preventDefault();
    if (!this.dragSourceCardId || card.id === this.dragSourceCardId) return;
    card.classList.add('drag-over');
  }

  onDragLeave(card) {
    card.classList.remove('drag-over');
  }

  onDrop(card, event) {
    event.preventDefault();
    card.classList.remove('drag-over');
    const srcId = event.dataTransfer.getData('text/plain') || this.dragSourceCardId;
    const srcEl = srcId ? this.doc.getElementById(srcId) : null;
    if (!srcEl || srcEl === card) return;
    const rect = card.getBoundingClientRect();
    const before = event.clientY - rect.top < rect.height / 2;
    if (before) this.grid.insertBefore(srcEl, card);
    else this.grid.insertBefore(srcEl, card.nextSibling);
    this.onOrderChange?.(this.getOrderedClipIds());
    this.recomputeLayout();
  }

  onLoadedMetadata(card, video, clip, metadataToken = this.metadataTracker.currentToken()) {
    clip.setVideoMetadata({
      durationSec: video.duration,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });
    setCardDuration(card, clip.durationSec, this.formatClipLabel);
    this.metadataTracker.markLoaded(metadataToken, clip);
  }

  onMetadataError(_card, video, clip, metadataToken = this.metadataTracker.currentToken()) {
    this.metadataTracker.markFailed(metadataToken, clip, video?.error || new Error('Video metadata failed to load.'));
  }

  renderCollection(collection, { cacheKey = null } = {}) {
    const nextCacheKey = this.normalizedCacheKey(cacheKey);
    const previousSelection = new Set(this.selectedClipIds);
    const isSwitchingFromCachedView = nextCacheKey && nextCacheKey !== this.activeCacheKey && this.activeCacheKey !== null;
    if (nextCacheKey && nextCacheKey !== this.activeCacheKey) {
      this.stashActiveGrid();
    }

    this.currentCollection = collection || null;

    const cachedEntry = this.cachedEntryFor(nextCacheKey, this.currentCollection);
    if (cachedEntry) {
      this.showCachedEntry(nextCacheKey, this.currentCollection, cachedEntry, previousSelection);
      return;
    }

    if (isSwitchingFromCachedView) {
      this.createActiveGridElement();
    }

    clearGridCards(this.grid);
    this.activeCacheKey = nextCacheKey;
    if (!this.currentCollection) {
      this.metadataTracker.reset();
      this.selectedClipIds = new Set();
      this.updateCount?.();
      this.recomputeLayout();
      this.notifySelectionChange();
      return;
    }
    const orderedClips = this.currentCollection.orderedClips();
    const metadataToken = this.metadataTracker.start(orderedClips);
    const fragment = this.doc.createDocumentFragment();
    for (const clip of orderedClips) {
      const mediaSource = clip.mediaSource || URL.createObjectURL(clip.file);
      const card = createThumbCard({
        doc: this.doc,
        clip,
        cardId: `card-${clip.id}`,
        mediaSource,
        formatLabel: this.formatClipLabel,
        onLoadedMetadata: (element, video, nextClip, token) => this.onLoadedMetadata(element, video, nextClip, token),
        onMetadataError: (element, video, nextClip, token) => this.onMetadataError(element, video, nextClip, token),
        metadataToken,
        onSelect: (element, event) => this.onSelect(element, event),
        onDoubleClick: (element) => this.onDoubleClick(element),
        onDragStart: (element, event) => this.onDragStart(element, event),
        onDragEnd: (element) => this.onDragEnd(element),
        onDragOver: (element, event) => this.onDragOver(element, event),
        onDragLeave: (element) => this.onDragLeave(element),
        onDrop: (element, event) => this.onDrop(element, event),
      });
      fragment.appendChild(card);
    }
    this.grid.appendChild(fragment);
    this.selectedClipIds = new Set(
      Array.from(previousSelection).filter((clipId) => this.currentCollection.hasClip(clipId))
    );
    this.applySelectionClasses();
    this.updateCount?.();
    this.recomputeLayout();
    this.notifySelectionChange();
  }

  getClipMediaSource(clipId) {
    return this.getCardByClipId(clipId)?.dataset.objectUrl || '';
  }

  destroy() {
    this.fsRestore();
    cancelGridPreviewPlayback(this.grid);
    clearGridCards(this.grid);
    this.invalidateAllViews();
    this.selectedClipIds = new Set();
    this.dragSourceCardId = null;
    this.activeCacheKey = null;
    this.setTitlesHidden(false);
    this.metadataTracker.reset();
  }
}

export function createClipCollectionGridController(options) {
  return new ClipCollectionGridController(options);
}

