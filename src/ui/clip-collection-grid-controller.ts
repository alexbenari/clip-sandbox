import type { Clip } from '../domain/clip.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import { GridVideoMetadataTracker } from './grid-video-metadata-tracker.js';
import type { DisplayLayoutRules } from './display-layout-rules.js';
import { ClipLabelFormatter } from './clip-label-formatter.js';
import { GridPreviewPlaybackController } from './grid-preview-playback-controller.js';

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

type ClipLabelFormatterFn = (name: string, durationSeconds: number | null) => string;

type ClipCard = HTMLElement & {
  dataset: DOMStringMap & {
    clipId?: string;
    name?: string;
    objectUrl?: string;
    durationSeconds?: string;
    layoutCols?: string;
    layoutCellHeight?: string;
  };
};

type GridLayout = {
  cols: number;
  rows?: number;
  cellH: number;
};

type FullscreenGridLayout = GridLayout & {
  targetVisible: number;
};

type GridViewCacheEntry = {
  container: ClipCard;
  collection: ClipSequence | null;
  signature: string;
};

type ClipCollectionGridControllerOptions = {
  grid?: HTMLElement | null;
  gridRoot?: HTMLElement | null;
  toolbar?: HTMLElement | null;
  getAvailableHeight?: () => number;
  coordinateWorkspaceLayout?: boolean;
  formatLabel?: ClipLabelFormatterFn;
  layoutRules?: Pick<DisplayLayoutRules, 'computeBestGrid' | 'computeFullscreenLayout'> | null;
  isFullscreen?: (() => boolean) | null;
  onMetadataFailure?: ((event: { clip: Clip; error: unknown }) => void) | null;
  updateCount?: () => void;
  onSelectionChange?: (selectedClipId: string | null, selectedClipIds: string[]) => void;
  onOrderChange?: (orderedClipIds: string[]) => void;
  onOpenClip?: (clipId: string) => void;
  onRemoveSelected?: (orderedClipIds: string[]) => void;
  onContextMenu?: (event: {
    point: { x: number; y: number };
    selectedClipId: string | null;
    selectedClipIds: string[];
    clipId: string | null;
  }) => void;
  metadataTracker?: GridVideoMetadataTracker;
  metadataRelayoutDebounceMs?: number;
};

export class ClipCollectionGridController {
  private asClipCard(element: Element | null | undefined): ClipCard | null {
  return element instanceof HTMLElement ? element as ClipCard : null;
}

  private gridCards(grid: HTMLElement | null | undefined): ClipCard[] {
  return Array.from(grid?.children || []).flatMap((element) => {
    const card = this.asClipCard(element);
    return card ? [card] : [];
  });
}

  private ensureStyles(): void {
  const doc = this.doc;
  if (doc.getElementById(CLIP_COLLECTION_GRID_STYLE_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = CLIP_COLLECTION_GRID_STYLE_ID;
  styleEl.textContent = DEFAULT_CLIP_COLLECTION_GRID_CSS;
  (doc.head || doc.documentElement).appendChild(styleEl);
}

  private updateCardLabel(card: HTMLElement | null | undefined): void {
  if (!card) return;
  const label = card.querySelector<HTMLElement>('.filename');
  if (!label) return;
  const name = card.dataset.name || '';
  const duration = Number.parseFloat(card.dataset.durationSeconds || '');
  const text = this.formatClipLabel(name, Number.isFinite(duration) ? duration : null);
  label.textContent = text;
  label.title = text;
}

  private setCardDuration(card: HTMLElement | null | undefined, seconds: number | null): void {
  if (!card) return;
  if (Number.isFinite(seconds)) card.dataset.durationSeconds = String(seconds);
  else card.dataset.durationSeconds = '';
  this.updateCardLabel(card);
}

  private clearGridCards(grid: HTMLElement): void {
  for (const el of this.gridCards(grid)) {
    const url = el.dataset.objectUrl;
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  grid.innerHTML = '';
}

  private copyGridSurfaceAttributes(from: HTMLElement | null | undefined, to: HTMLElement): void {
  to.className = from?.className || 'clip-collection-grid';
  to.style.cssText = from?.style?.cssText || '';
}

  private showGridSurface(grid: HTMLElement | null | undefined): void {
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

  private hideGridSurface(grid: HTMLElement | null | undefined): void {
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

  private clipSequenceSignature(collection: ClipSequence | null | undefined): string {
  return (collection?.orderedClips?.() || []).map((clip) => clip.id).join('\n');
}

  private removeDragOverClasses(grid: HTMLElement): void {
  for (const el of this.gridCards(grid)) el.classList.remove('drag-over');
}

  private isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  return !!editable;
}

  private createThumbCard({
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
}: {
  doc?: Document;
  clip: Clip;
  cardId: string;
  mediaSource: string;
  formatLabel: ClipLabelFormatterFn;
  onSelect: (card: ClipCard, event: MouseEvent) => void;
  onDoubleClick?: (card: ClipCard) => void;
  onDragStart: (card: ClipCard, event: DragEvent) => void;
  onDragEnd: (card: ClipCard) => void;
  onDragOver: (card: ClipCard, event: DragEvent) => void;
  onDragLeave: (card: ClipCard) => void;
  onDrop: (card: ClipCard, event: DragEvent) => void;
  onLoadedMetadata: (card: ClipCard, video: HTMLVideoElement, clip: Clip, metadataToken: number) => void;
  onMetadataError: (card: ClipCard, video: HTMLVideoElement, clip: Clip, metadataToken: number) => void;
  metadataToken: number;
}): ClipCard {
  const card = doc.createElement('div');
  card.className = 'thumb';
  card.tabIndex = 0;
  card.id = cardId;
  card.draggable = true;
  card.dataset.clipId = clip.id;
  card.dataset.name = clip.name;
  card.dataset.objectUrl = mediaSource;
  card.dataset.durationSeconds = Number.isFinite(clip.durationSec) ? String(clip.durationSec) : '';

  const vid = doc.createElement('video');
  vid.src = mediaSource;
  vid.loop = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  vid.addEventListener(
    'canplay',
    () => {
      this.previewPlayback.start(vid);
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
    this.previewPlayback.start(vid);
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

  private grid: HTMLElement;
  private gridRoot: HTMLElement | null;
  private toolbar: HTMLElement | null;
  private readonly getAvailableHeight?: () => number;
  private fullscreenSlots = 12;
  private cancelPendingRotation: (() => void) | null = null;
  private formatClipLabel: ClipLabelFormatterFn;
  private layoutRules: Pick<DisplayLayoutRules, 'computeBestGrid' | 'computeFullscreenLayout'> | null;
  private isFullscreen: (() => boolean) | null;
  private onMetadataFailure: ((event: { clip: Clip; error: unknown }) => void) | null;
  private updateCount?: () => void;
  private onSelectionChange?: (selectedClipId: string | null, selectedClipIds: string[]) => void;
  private onOrderChange?: (orderedClipIds: string[]) => void;
  private onOpenClip?: (clipId: string) => void;
  private onRemoveSelected?: (orderedClipIds: string[]) => void;
  private onContextMenu?: NonNullable<ClipCollectionGridControllerOptions['onContextMenu']>;
  private doc: Document;
  private currentCollection: ClipSequence | null;
  private selectedClipIds: Set<string>;
  private dragSourceCardId: string | null;
  private hiddenCards: ClipCard[];
  private currentAppliedCols: number | null;
  private pendingMetadataRelayout: boolean;
  private activeCacheKey: string | null;
  private gridViewCache: Map<string, GridViewCacheEntry>;
  private metadataTracker: GridVideoMetadataTracker;
  private readonly coordinateWorkspaceLayout: boolean;
  private readonly previewPlayback = new GridPreviewPlaybackController();
  private workspaceBounds: { width: number; height: number } | null = null;

  constructor(options: ClipCollectionGridControllerOptions = {}) {
    if (!options.grid) throw new Error('A grid element is required.');
    this.grid = options.grid;
    this.gridRoot = options.gridRoot ?? this.grid?.parentElement ?? null;
    this.toolbar = options.toolbar ?? null;
    this.getAvailableHeight = options.getAvailableHeight;
    this.coordinateWorkspaceLayout = options.coordinateWorkspaceLayout ?? false;
    const defaultLabelFormatter = new ClipLabelFormatter();
    this.formatClipLabel = options.formatLabel ?? defaultLabelFormatter.formatLabel.bind(defaultLabelFormatter);
    this.layoutRules = options.layoutRules ?? null;
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
    this.metadataTracker = options.metadataTracker ?? new GridVideoMetadataTracker({
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

    this.ensureStyles();
    this.gridRoot?.classList.add('clip-collection-grid-root');
    this.grid?.classList.add('clip-collection-grid');
    this.gridRoot?.addEventListener('contextmenu', this.onGridContextMenu);
  }

  private hiddenCardBuffer(): ClipCard[] {
    return this.hiddenCards;
  }

  private replaceHiddenCards(nextHiddenCards: ClipCard[]): void {
    this.hiddenCards = nextHiddenCards;
  }

  private normalizedCacheKey(cacheKey: string | null | undefined): string | null {
    const key = String(cacheKey || '').trim();
    return key || null;
  }

  private setActiveGridElement(nextGrid: HTMLElement | null): void {
    if (!nextGrid || nextGrid === this.grid) {
      this.grid?.classList.add('clip-collection-grid');
      if (this.grid?.id !== 'grid') this.grid.id = 'grid';
      this.showGridSurface(this.grid);
      return;
    }
    if (this.grid?.id === 'grid') this.grid.removeAttribute('id');
    this.hideGridSurface(this.grid);
    nextGrid.id = 'grid';
    this.showGridSurface(nextGrid);
    nextGrid.classList.add('clip-collection-grid');
    this.grid = nextGrid;
  }

  private createActiveGridElement(): HTMLElement {
    const nextGrid = this.doc.createElement('div');
    this.copyGridSurfaceAttributes(this.grid, nextGrid);
    this.gridRoot?.appendChild(nextGrid);
    this.setActiveGridElement(nextGrid);
    return nextGrid;
  }

  private stashActiveGrid(): void {
    if (!this.activeCacheKey || !this.currentCollection) return;
    let entry = this.gridViewCache.get(this.activeCacheKey);
    if (!entry) {
      entry = {
        container: this.grid as ClipCard,
        collection: null,
        signature: '',
      };
      this.gridViewCache.set(this.activeCacheKey, entry);
    }
    this.fsRestore();
    this.removeDragOverClasses(this.grid);
    this.previewPlayback.cancel(this.grid);
    entry.collection = this.currentCollection;
    entry.signature = this.clipSequenceSignature(this.currentCollection);
    entry.container = this.grid as ClipCard;
    this.hideGridSurface(entry.container);
    if (entry.container.id === 'grid') entry.container.removeAttribute('id');
  }

  private cachedEntryFor(cacheKey: string | null, collection: ClipSequence | null): GridViewCacheEntry | null {
    const key = this.normalizedCacheKey(cacheKey);
    if (!key) return null;
    const entry = this.gridViewCache.get(key);
    if (!entry) return null;
    if (entry.signature !== this.clipSequenceSignature(collection)) {
      this.clearCacheEntry(entry);
      this.gridViewCache.delete(key);
      return null;
    }
    return entry;
  }

  private clearCacheEntry(entry: GridViewCacheEntry | null): void {
    if (!entry) return;
    if (entry.container === this.grid) this.fsRestore();
    this.clearGridCards(entry.container);
    if (entry.container !== this.grid) entry.container.remove();
    entry.collection = null;
    entry.signature = '';
  }

  private showCachedEntry(
    cacheKey: string | null,
    collection: ClipSequence,
    entry: GridViewCacheEntry,
    previousSelection: Set<string>
  ): void {
    this.currentCollection = collection;
    this.setActiveGridElement(entry.container);
    this.activeCacheKey = this.normalizedCacheKey(cacheKey);
    const orderedClips = this.currentCollection?.orderedClips?.() || [];
    this.metadataTracker.start(orderedClips);
    this.selectedClipIds = new Set(
      Array.from(previousSelection).filter((clipId) => collection.hasClip(clipId))
    );
    this.applySelectionClasses();
    this.updateCount?.();
    this.recomputeLayout();
    this.notifySelectionChange();
    this.previewPlayback.schedule(this.grid);
  }

  invalidateView(cacheKey: string | null | undefined): void {
    const key = this.normalizedCacheKey(cacheKey);
    if (!key) return;
    const entry = this.gridViewCache.get(key);
    if (entry) this.clearCacheEntry(entry);
    this.gridViewCache.delete(key);
  }

  invalidateAllViews(): void {
    for (const entry of this.gridViewCache.values()) {
      this.clearCacheEntry(entry);
    }
    this.gridViewCache.clear();
  }

  retagActiveView(cacheKey: string | null | undefined): void {
    this.activeCacheKey = this.normalizedCacheKey(cacheKey);
  }

  focusSelectedClip(): boolean {
    const card = this.getCardByClipId(this.getSelectedClipIds()[0]);
    if (!card) return false;
    card.tabIndex = -1;
    card.focus({ preventScroll: true });
    return true;
  }

  private allocatedHeight(): number | undefined {
    if (this.getAvailableHeight) return this.getAvailableHeight();
    if (this.coordinateWorkspaceLayout && this.gridRoot) {
      const style = (this.doc.defaultView || window).getComputedStyle(this.gridRoot);
      return Math.max(0, this.gridRoot.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0));
    }
    return undefined;
  }

  private readGridMetrics(mode: 'normal' | 'fullscreen'): { gap: number; availW: number; availH: number } {
    const view = this.doc.defaultView || window;
    const gap = parseFloat(view.getComputedStyle(this.grid).gap) || 0;
    const rootWidth = this.gridRoot?.clientWidth || this.grid?.clientWidth || 0;
    const padding = this.coordinateWorkspaceLayout && this.gridRoot ? view.getComputedStyle(this.gridRoot) : null;
    const horizontalPadding = padding ? (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0) : 0;
    const availW = mode === 'normal' && this.workspaceBounds ? this.workspaceBounds.width : rootWidth - horizontalPadding;
    const toolbarHeight = this.toolbar ? Math.ceil(this.toolbar.getBoundingClientRect().height) : 0;
    const chromeH = mode === 'fullscreen' ? 28 : toolbarHeight + 28;
    const availH = mode === 'normal' && this.workspaceBounds ? this.workspaceBounds.height : mode === 'normal' ? this.allocatedHeight() ?? view.innerHeight - chromeH : view.innerHeight - chromeH;
    return { gap, availW, availH };
  }

  computeGrid(): void {
    const count = this.grid.children.length;
    if (count === 0) {
      this.grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
      if (this.coordinateWorkspaceLayout) this.grid.style.height = '0px';
      this.currentAppliedCols = 1;
      return;
    }
    if (!this.layoutRules) return;
    const { gap, availW, availH } = this.readGridMetrics('normal');
    const { cols, cellH } = this.layoutRules.computeBestGrid({
      count,
      availW,
      availH,
      gap,
      clips: this.currentCollection?.orderedClips?.() || [],
    });
    const previousCols = Number.parseInt(this.grid.dataset.layoutCols || '', 10);
    const previousCellH = Number.parseFloat(this.grid.dataset.layoutCellHeight || '');
    if (!this.coordinateWorkspaceLayout && previousCols === cols && Number.isFinite(previousCellH) && Math.abs(previousCellH - cellH) < 0.5) {
      this.currentAppliedCols = cols;
      return;
    }
    if (this.coordinateWorkspaceLayout) this.applyWorkspaceGrid(cols, cellH, availW, gap);
    else this.applyGridLayout(cols, cellH);
    this.grid.dataset.layoutCols = String(cols);
    this.grid.dataset.layoutCellHeight = String(cellH);
    this.currentAppliedCols = cols;
  }

  private recomputeGridIfColumnCountChanged(): void {
    if (this.coordinateWorkspaceLayout) { this.computeGrid(); return; }
    const count = this.grid.children.length;
    if (count === 0 || !this.layoutRules) return;
    const { gap, availW, availH } = this.readGridMetrics('normal');
    const { cols, cellH } = this.layoutRules.computeBestGrid({
      count,
      availW,
      availH,
      gap,
      clips: this.currentCollection?.orderedClips?.() || [],
    });
    if (cols === this.currentAppliedCols) return;
    this.applyGridLayout(cols, cellH);
    this.grid.dataset.layoutCols = String(cols);
    this.grid.dataset.layoutCellHeight = String(cellH);
    this.currentAppliedCols = cols;
  }

  private onMetadataComplete(): void {
    if (this.isFullscreen?.()) return;
    if (this.workspaceBounds) return;
    if (this.dragSourceCardId) {
      this.pendingMetadataRelayout = true;
      return;
    }
    this.recomputeGridIfColumnCountChanged();
  }

  private fsComputeAndApplyGrid(): FullscreenGridLayout {
    if (this.coordinateWorkspaceLayout) this.clearWorkspaceGrid();
    if (!this.layoutRules) {
      return { cols: 1, rows: Math.max(1, this.grid.children.length), cellH: 0, targetVisible: this.grid.children.length };
    }
    const { gap, availW, availH } = this.readGridMetrics('fullscreen');
    const best = this.layoutRules.computeFullscreenLayout({
      slots: this.fullscreenSlots,
      availW,
      availH,
      gap,
    });
    this.applyGridLayout(best.cols, best.cellH);
    return best;
  }

  fsRestore(): void {
    this.cancelRotation();
    for (const card of this.gridCards(this.grid)) card.style.order = '';
    const cardsToRestore = this.hiddenCardBuffer();
    if (cardsToRestore.length === 0) return;
    cardsToRestore.forEach((element) => {
      element.style.display = '';
      this.previewPlayback.start(element.querySelector('video'));
    });
    this.replaceHiddenCards([]);
  }

  fsApplySlots(slots = this.fullscreenSlots): void {
    this.fullscreenSlots = slots;
    this.fsRestore();
    const best = this.fsComputeAndApplyGrid();
    const children = this.gridCards(this.grid);
    const total = children.length;
    if (total === 0) return;

    const targetVisible = Math.max(1, Math.min(total, best.targetVisible));
    let toHide = Math.max(0, total - targetVisible);
    const nextHiddenCards: ClipCard[] = [];
    for (let i = 0; i < total; i += 1) {
      const element = children[i];
      element.style.order = String(i);
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

  cancelRotation(): void {
    this.cancelPendingRotation?.();
  }

  rotateVisibleClip(): void {
    if (!this.isFullscreen?.() || this.cancelPendingRotation) return;
    const cards = this.gridCards(this.grid);
    const visible = cards.filter(card => card.style.display !== 'none');
    const hidden = this.hiddenCards;
    if (visible.length <= 1 || hidden.length === 0) return;
    const outgoing = visible[Math.floor(Math.random() * visible.length)];
    const incoming = hidden[Math.floor(Math.random() * hidden.length)];
    const video = outgoing.querySelector('video');
    if (!video) return;
    const finish = () => {
      this.cancelRotation();
      if (!this.isFullscreen?.()) return;
      const outgoingOrder = outgoing.style.order;
      outgoing.style.order = incoming.style.order;
      incoming.style.order = outgoingOrder;
      outgoing.style.display = 'none';
      incoming.style.display = '';
      this.hiddenCards = hidden.filter(card => card !== incoming).concat(outgoing);
      this.previewPlayback.start(incoming.querySelector('video'));
    };
    const previousLoop = video.loop;
    this.cancelPendingRotation = () => {
      video.removeEventListener('ended', finish);
      video.loop = previousLoop;
      this.cancelPendingRotation = null;
    };
    video.loop = false;
    video.addEventListener('ended', finish, { once: true });
  }

  recomputeLayout(): void {
    if (this.isFullscreen?.()) {
      this.fsApplySlots();
      return;
    }
    this.computeGrid();
  }

  beginWorkspaceResize(width: number, durationMs: number): void {
    if (!this.coordinateWorkspaceLayout || this.isFullscreen?.()) return;
    const padding = this.gridRoot ? getComputedStyle(this.gridRoot) : null;
    const horizontalPadding = padding ? (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0) : 0;
    this.workspaceBounds = { width: Math.max(0, width - horizontalPadding), height: this.allocatedHeight() ?? this.readGridMetrics('normal').availH };
    // A reversal samples the current visual card positions through CSS transitions.
    this.grid.style.setProperty('--grid-duration', `${durationMs}ms`);
    this.computeGrid();
  }

  endWorkspaceResize(): void {
    this.workspaceBounds = null;
    this.grid.style.setProperty('--grid-duration', '0ms');
    this.recomputeLayout();
  }

  private applyGridLayout(cols: number, cellHeight: number): void {
    this.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const card of this.gridCards(this.grid)) card.style.height = `${cellHeight}px`;
  }

  private applyWorkspaceGrid(cols: number, cellHeight: number, width: number, gap: number): void {
    this.grid.classList.add('workspace-grid');
    const cellWidth = Math.max(0, (width - (cols - 1) * gap) / cols);
    Array.from(this.grid.children).forEach((card, index) => {
      if (!(card instanceof HTMLElement)) return;
      Object.assign(card.style, {
        left: `${index % cols * (cellWidth + gap)}px`, top: `${Math.floor(index / cols) * (cellHeight + gap)}px`,
        width: `${cellWidth}px`, height: `${cellHeight}px`,
      });
    });
    const rows = Math.ceil(this.grid.children.length / cols);
    this.grid.style.height = `${Math.max(0, rows * (cellHeight + gap) - gap)}px`;
  }

  private clearWorkspaceGrid(): void {
    this.workspaceBounds = null;
    this.grid.classList.remove('workspace-grid');
    this.grid.style.height = '';
    for (const card of Array.from(this.grid.children)) {
      if (card instanceof HTMLElement) { card.style.left = ''; card.style.top = ''; card.style.width = ''; }
    }
  }

  private notifySelectionChange(): void {
    this.onSelectionChange?.(this.getSelectedClipId(), this.getSelectedClipIds());
  }

  getSelectedClipId(): string | null {
    const selectedIds = this.getSelectedClipIds();
    return selectedIds.length === 1 ? selectedIds[0] : null;
  }

  getSelectedClipIds(): string[] {
    return this.getOrderedClipIds().filter((clipId) => this.selectedClipIds.has(clipId));
  }

  private getCardByClipId(clipId: string | null | undefined): ClipCard | null {
    if (!clipId) return null;
    return this.gridCards(this.grid).find((card) => card.dataset.clipId === clipId) || null;
  }

  getClipById(clipId: string | null | undefined): Clip | null {
    if (!clipId) return null;
    return this.currentCollection?.getClip(clipId) || null;
  }

  getClipIdByName(name: string | null | undefined): string | null {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return null;
    return this.currentCollection?.orderedClips?.().find((clip) => clip.name === normalizedName)?.id || null;
  }

  private getAdjacentClip(clipId: string | null | undefined, offset: number): Clip | null {
    const currentCard = this.getCardByClipId(clipId);
    if (!currentCard) return null;
    const orderedCards = this.gridCards(this.grid);
    const currentIndex = orderedCards.indexOf(currentCard);
    if (currentIndex === -1) return null;
    const adjacentCard = orderedCards[currentIndex + offset];
    return this.getClipById(adjacentCard?.dataset.clipId || '');
  }

  getNextClip(clipId: string | null | undefined): Clip | null {
    return this.getAdjacentClip(clipId, 1);
  }

  getPrevClip(clipId: string | null | undefined): Clip | null {
    return this.getAdjacentClip(clipId, -1);
  }

  getOrderedClipIds(): string[] {
    return this.gridCards(this.grid)
      .map((card) => card.dataset.clipId)
      .filter((clipId): clipId is string => !!clipId);
  }

  getCardCount(): number {
    return this.grid?.children?.length || 0;
  }

  areTitlesHidden(): boolean {
    return !!this.gridRoot?.classList.contains('titles-hidden');
  }

  setTitlesHidden(hidden: boolean): void {
    this.gridRoot?.classList.toggle('titles-hidden', !!hidden);
  }

  private applySelectionClasses(): void {
    for (const card of this.gridCards(this.grid)) {
      card.classList.toggle('selected', this.selectedClipIds.has(card.dataset.clipId || ''));
    }
  }

  clearSelection(): void {
    this.selectedClipIds = new Set();
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  setSelectedClipId(clipId: string | null | undefined): void {
    this.selectedClipIds = clipId ? new Set([clipId]) : new Set();
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  private selectOnlyCard(card: ClipCard | null | undefined): void {
    if (!card) {
      this.clearSelection();
      return;
    }
    this.selectedClipIds = card.dataset.clipId ? new Set([card.dataset.clipId]) : new Set();
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  private toggleCardSelection(card: ClipCard | null | undefined): void {
    const clipId = card?.dataset.clipId || '';
    if (!clipId) return;
    if (this.selectedClipIds.has(clipId)) this.selectedClipIds.delete(clipId);
    else this.selectedClipIds.add(clipId);
    this.applySelectionClasses();
    this.notifySelectionChange();
  }

  private onSelect(card: ClipCard | null | undefined, event: MouseEvent): void {
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

  private onDoubleClick(card: ClipCard | null | undefined): void {
    this.selectOnlyCard(card);
    const clipId = card?.dataset.clipId || null;
    if (clipId) this.onOpenClip?.(clipId);
  }

  private onGridContextMenu(event: MouseEvent): void {
    if (!this.onContextMenu) return;
    event.preventDefault();
    const card = event.target instanceof Element ? this.asClipCard(event.target.closest('.thumb')) : null;
    this.onContextMenu({
      point: { x: event.clientX, y: event.clientY },
      selectedClipId: this.getSelectedClipId(),
      selectedClipIds: this.getSelectedClipIds(),
      clipId: card?.dataset.clipId || null,
    });
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.onRemoveSelected) return false;
    if (!(event?.key === 'Delete' || event?.key === 'Backspace')) return false;
    if (this.isEditableTarget(event.target)) return false;
    const orderedSelectedClipIds = this.getSelectedClipIds();
    if (orderedSelectedClipIds.length === 0) return false;
    this.onRemoveSelected(orderedSelectedClipIds);
    event.preventDefault();
    return true;
  }

  private onDragStart(card: ClipCard, event: DragEvent): void {
    this.dragSourceCardId = card.id;
    card.classList.add('dragging');
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.id);
  }

  private onDragEnd(card: ClipCard): void {
    card.classList.remove('dragging');
    this.dragSourceCardId = null;
    this.removeDragOverClasses(this.grid);
    if (this.pendingMetadataRelayout) {
      this.pendingMetadataRelayout = false;
      this.onMetadataComplete();
    }
  }

  private onDragOver(card: ClipCard, event: DragEvent): void {
    event.preventDefault();
    if (!this.dragSourceCardId || card.id === this.dragSourceCardId) return;
    card.classList.add('drag-over');
  }

  private onDragLeave(card: ClipCard): void {
    card.classList.remove('drag-over');
  }

  private onDrop(card: ClipCard, event: DragEvent): void {
    event.preventDefault();
    card.classList.remove('drag-over');
    const srcId = event.dataTransfer?.getData('text/plain') || this.dragSourceCardId;
    const srcEl = srcId ? this.doc.getElementById(srcId) : null;
    if (!srcEl || srcEl === card) return;
    const rect = card.getBoundingClientRect();
    const before = event.clientY - rect.top < rect.height / 2;
    if (before) this.grid.insertBefore(srcEl, card);
    else this.grid.insertBefore(srcEl, card.nextSibling);
    this.onOrderChange?.(this.getOrderedClipIds());
    this.recomputeLayout();
  }

  private onLoadedMetadata(
    card: ClipCard,
    video: HTMLVideoElement,
    clip: Clip,
    metadataToken = this.metadataTracker.currentToken()
  ): void {
    clip.setVideoMetadata({
      durationSec: video.duration,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });
    this.setCardDuration(card, clip.durationSec);
    this.metadataTracker.markLoaded(metadataToken, clip);
  }

  private onMetadataError(
    _card: ClipCard,
    video: HTMLVideoElement,
    clip: Clip,
    metadataToken = this.metadataTracker.currentToken()
  ): void {
    this.metadataTracker.markFailed(metadataToken, clip, video?.error || new Error('Video metadata failed to load.'));
  }

  renderCollection(collection: ClipSequence | null | undefined, { cacheKey = null }: { cacheKey?: string | null } = {}): void {
    this.fsRestore();
    const nextCacheKey = this.normalizedCacheKey(cacheKey);
    const previousSelection = new Set(this.selectedClipIds);
    const isSwitchingFromCachedView = nextCacheKey && nextCacheKey !== this.activeCacheKey && this.activeCacheKey !== null;
    if (nextCacheKey && nextCacheKey !== this.activeCacheKey) {
      this.stashActiveGrid();
    }

    this.currentCollection = collection || null;

    const cachedEntry = this.cachedEntryFor(nextCacheKey, this.currentCollection);
    if (cachedEntry) {
      if (this.currentCollection) {
        this.showCachedEntry(nextCacheKey, this.currentCollection, cachedEntry, previousSelection);
      }
      return;
    }

    if (isSwitchingFromCachedView) {
      this.createActiveGridElement();
    }

    this.clearGridCards(this.grid);
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
      const card = this.createThumbCard({
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
      Array.from(previousSelection).filter((clipId) => this.currentCollection?.hasClip(clipId))
    );
    this.applySelectionClasses();
    this.updateCount?.();
    this.recomputeLayout();
    this.notifySelectionChange();
  }

  getClipMediaSource(clipId: string | null | undefined): string {
    return this.getCardByClipId(clipId)?.dataset.objectUrl || '';
  }

  destroy(): void {
    this.fsRestore();
    this.previewPlayback.cancel(this.grid);
    this.clearGridCards(this.grid);
    this.invalidateAllViews();
    this.selectedClipIds = new Set();
    this.dragSourceCardId = null;
    this.activeCacheKey = null;
    this.setTitlesHidden(false);
    this.metadataTracker.reset();
  }
}
