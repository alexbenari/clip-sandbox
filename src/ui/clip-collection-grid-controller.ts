// @ts-nocheck
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

  const name = doc.createElement('div');
  name.className = 'filename';
  const text = formatLabel(clip.name, Number.isFinite(clip.durationSec) ? clip.durationSec : null);
  name.title = text;
  name.textContent = text;

  card.appendChild(vid);
  card.appendChild(name);

  vid.addEventListener('loadedmetadata', () => onLoadedMetadata(card, vid, clip));
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

    this.renderCollection = this.renderCollection.bind(this);
    this.destroy = this.destroy.bind(this);
    this.clearSelection = this.clearSelection.bind(this);
    this.getSelectedClipId = this.getSelectedClipId.bind(this);
    this.getSelectedClipIds = this.getSelectedClipIds.bind(this);
    this.setSelectedClipId = this.setSelectedClipId.bind(this);
    this.getCardByClipId = this.getCardByClipId.bind(this);
    this.getClipById = this.getClipById.bind(this);
    this.getClipMediaSource = this.getClipMediaSource.bind(this);
    this.getNextClip = this.getNextClip.bind(this);
    this.getPrevClip = this.getPrevClip.bind(this);
    this.getOrderedClipIds = this.getOrderedClipIds.bind(this);
    this.areTitlesHidden = this.areTitlesHidden.bind(this);
    this.setTitlesHidden = this.setTitlesHidden.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.recomputeLayout = this.recomputeLayout.bind(this);
    this.computeGrid = this.computeGrid.bind(this);
    this.fsApplySlots = this.fsApplySlots.bind(this);
    this.fsRestore = this.fsRestore.bind(this);
    this.onGridContextMenu = this.onGridContextMenu.bind(this);

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
      return;
    }
    if (!this.computeBestGridFn || !this.applyGridLayoutFn) return;
    const { gap, availW, availH } = this.readGridMetrics('normal');
    const { cols, cellH } = this.computeBestGridFn({ count, availW, availH, gap });
    this.applyGridLayoutFn(cols, cellH);
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

  onLoadedMetadata(card, video, clip) {
    clip.setDuration(video.duration);
    setCardDuration(card, clip.durationSec, this.formatClipLabel);
  }

  renderCollection(collection) {
    this.currentCollection = collection || null;
    const previousSelection = new Set(this.selectedClipIds);
    clearGridCards(this.grid);
    if (!this.currentCollection) {
      this.selectedClipIds = new Set();
      this.updateCount?.();
      this.recomputeLayout();
      this.notifySelectionChange();
      return;
    }
    for (const clip of this.currentCollection.orderedClips()) {
      const mediaSource = clip.mediaSource || URL.createObjectURL(clip.file);
      const card = createThumbCard({
        doc: this.doc,
        clip,
        cardId: `card-${clip.id}`,
        mediaSource,
        formatLabel: this.formatClipLabel,
        onLoadedMetadata: (element, video, nextClip) => this.onLoadedMetadata(element, video, nextClip),
        onSelect: (element, event) => this.onSelect(element, event),
        onDoubleClick: (element) => this.onDoubleClick(element),
        onDragStart: (element, event) => this.onDragStart(element, event),
        onDragEnd: (element) => this.onDragEnd(element),
        onDragOver: (element, event) => this.onDragOver(element, event),
        onDragLeave: (element) => this.onDragLeave(element),
        onDrop: (element, event) => this.onDrop(element, event),
      });
      this.grid.appendChild(card);
    }
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
    clearGridCards(this.grid);
    this.selectedClipIds = new Set();
    this.dragSourceCardId = null;
    this.setTitlesHidden(false);
  }
}

export function createClipCollectionGridController(options) {
  return new ClipCollectionGridController(options);
}

