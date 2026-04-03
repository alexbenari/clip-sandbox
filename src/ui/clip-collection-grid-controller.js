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
    if (url) URL.revokeObjectURL(url);
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
  clip,
  cardId,
  objectUrl,
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
  const card = document.createElement('div');
  card.className = 'thumb';
  card.tabIndex = 0;
  card.id = cardId;
  card.draggable = true;
  card.dataset.clipId = clip.id;
  card.dataset.name = clip.name;
  card.dataset.objectUrl = objectUrl;
  card.dataset.durationSeconds = Number.isFinite(clip.durationSec) ? clip.durationSec : '';

  const vid = document.createElement('video');
  vid.src = objectUrl;
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

export function createClipCollectionGridController({
  grid,
  gridRoot = grid?.parentElement || null,
  formatLabel: formatClipLabel = formatLabel,
  updateCount,
  recomputeLayout,
  onSelectionChange,
  onOrderChange,
  onOpenClip,
  onRemoveSelected,
  onContextMenu,
} = {}) {
  const doc = grid?.ownerDocument || document;
  let currentCollection = null;
  let selectedClipIds = new Set();
  let dragSourceCardId = null;

  ensureClipCollectionGridStyles(doc);
  gridRoot?.classList.add('clip-collection-grid-root');
  grid?.classList.add('clip-collection-grid');

  function notifySelectionChange() {
    onSelectionChange?.(getSelectedClipId(), getSelectedClipIds());
  }

  function getSelectedClipId() {
    const selectedIds = getSelectedClipIds();
    return selectedIds.length === 1 ? selectedIds[0] : null;
  }

  function getSelectedClipIds() {
    return orderedClipIdsFromDom().filter((clipId) => selectedClipIds.has(clipId));
  }

  function getCardByClipId(clipId) {
    if (!clipId) return null;
    return Array.from(grid.children).find((card) => card.dataset.clipId === clipId) || null;
  }

  function getClipById(clipId) {
    return currentCollection?.getClip(clipId) || null;
  }

  function getAdjacentClip(clipId, offset) {
    const currentCard = getCardByClipId(clipId);
    if (!currentCard) return null;
    const orderedCards = Array.from(grid.children);
    const currentIndex = orderedCards.indexOf(currentCard);
    if (currentIndex === -1) return null;
    const adjacentCard = orderedCards[currentIndex + offset];
    return getClipById(adjacentCard?.dataset.clipId || '');
  }

  function areTitlesHidden() {
    return !!gridRoot?.classList.contains('titles-hidden');
  }

  function setTitlesHidden(hidden) {
    gridRoot?.classList.toggle('titles-hidden', !!hidden);
  }

  function applySelectionClasses() {
    for (const card of Array.from(grid.children)) {
      card.classList.toggle('selected', selectedClipIds.has(card.dataset.clipId));
    }
  }

  function clearSelection() {
    selectedClipIds = new Set();
    applySelectionClasses();
    notifySelectionChange();
  }

  function setSelectedClipId(clipId) {
    selectedClipIds = clipId ? new Set([clipId]) : new Set();
    applySelectionClasses();
    notifySelectionChange();
  }

  function selectOnlyCard(card) {
    if (!card) {
      clearSelection();
      return;
    }
    selectedClipIds = new Set([card.dataset.clipId]);
    applySelectionClasses();
    notifySelectionChange();
  }

  function toggleCardSelection(card) {
    const clipId = card?.dataset.clipId || '';
    if (!clipId) return;
    if (selectedClipIds.has(clipId)) selectedClipIds.delete(clipId);
    else selectedClipIds.add(clipId);
    applySelectionClasses();
    notifySelectionChange();
  }

  function onSelect(card, event) {
    const clipId = card?.dataset.clipId || null;
    if (!clipId) {
      clearSelection();
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      toggleCardSelection(card);
      return;
    }
    selectOnlyCard(card);
  }

  function onDoubleClick(card) {
    selectOnlyCard(card);
    const clipId = card?.dataset.clipId || null;
    if (clipId) onOpenClip?.(clipId);
  }

  function onGridContextMenu(event) {
    if (!onContextMenu) return;
    event.preventDefault();
    const card = event.target instanceof Element ? event.target.closest('.thumb') : null;
    onContextMenu({
      card,
      point: { x: event.clientX, y: event.clientY },
      selectedClipId: getSelectedClipId(),
      selectedClipIds: getSelectedClipIds(),
      clipId: card?.dataset.clipId || null,
    });
  }

  function handleKeyDown(event) {
    if (!onRemoveSelected) return false;
    if (!(event?.key === 'Delete' || event?.key === 'Backspace')) return false;
    if (isEditableTarget(event.target)) return false;
    const orderedSelectedClipIds = getSelectedClipIds();
    if (orderedSelectedClipIds.length === 0) return false;
    onRemoveSelected(orderedSelectedClipIds);
    event.preventDefault();
    return true;
  }

  function onDragStart(card, event) {
    dragSourceCardId = card.id;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.id);
  }

  function onDragEnd(card) {
    card.classList.remove('dragging');
    dragSourceCardId = null;
    removeDragOverClasses(grid);
  }

  function onDragOver(card, event) {
    event.preventDefault();
    if (!dragSourceCardId || card.id === dragSourceCardId) return;
    card.classList.add('drag-over');
  }

  function onDragLeave(card) {
    card.classList.remove('drag-over');
  }

  function orderedClipIdsFromDom() {
    return Array.from(grid.children)
      .map((card) => card.dataset.clipId)
      .filter(Boolean);
  }

  function onDrop(card, event) {
    event.preventDefault();
    card.classList.remove('drag-over');
    const srcId = event.dataTransfer.getData('text/plain') || dragSourceCardId;
    const srcEl = srcId ? document.getElementById(srcId) : null;
    if (!srcEl || srcEl === card) return;
    const rect = card.getBoundingClientRect();
    const before = event.clientY - rect.top < rect.height / 2;
    if (before) grid.insertBefore(srcEl, card);
    else grid.insertBefore(srcEl, card.nextSibling);
    onOrderChange?.(orderedClipIdsFromDom());
    recomputeLayout?.();
  }

  function onLoadedMetadata(card, video, clip) {
    clip.setDuration(video.duration);
    setCardDuration(card, clip.durationSec, formatClipLabel);
  }

  function destroy() {
    clearGridCards(grid);
    selectedClipIds = new Set();
    dragSourceCardId = null;
    setTitlesHidden(false);
  }

  function renderCollection(collection) {
    currentCollection = collection || null;
    const previousSelection = new Set(selectedClipIds);
    clearGridCards(grid);
    if (!currentCollection) {
      selectedClipIds = new Set();
      updateCount?.();
      recomputeLayout?.();
      notifySelectionChange();
      return;
    }
    for (const clip of currentCollection.orderedClips()) {
      const objectUrl = URL.createObjectURL(clip.file);
      const card = createThumbCard({
        clip,
        cardId: `card-${clip.id}`,
        objectUrl,
        formatLabel: formatClipLabel,
        onLoadedMetadata,
        onSelect,
        onDoubleClick,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
      });
      grid.appendChild(card);
    }
    selectedClipIds = new Set(
      Array.from(previousSelection).filter((clipId) => currentCollection.hasClip(clipId))
    );
    applySelectionClasses();
    updateCount?.();
    recomputeLayout?.();
    notifySelectionChange();
  }

  function getClipMediaSource(clipId) {
    return getCardByClipId(clipId)?.dataset.objectUrl || '';
  }

  gridRoot?.addEventListener('contextmenu', onGridContextMenu);

  return {
    renderCollection,
    destroy,
    clearSelection,
    getSelectedClipId,
    getSelectedClipIds,
    setSelectedClipId,
    getCardByClipId,
    getClipById,
    getClipMediaSource,
    getNextClip: (clipId) => getAdjacentClip(clipId, 1),
    getPrevClip: (clipId) => getAdjacentClip(clipId, -1),
    getOrderedClipIds: orderedClipIdsFromDom,
    areTitlesHidden,
    setTitlesHidden,
    handleKeyDown,
  };
}
