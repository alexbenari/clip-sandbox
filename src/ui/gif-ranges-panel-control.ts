import { CaptureEndpointValue, type CaptureEndpoint } from '../domain/capture-endpoint.js';
import type { CapturedRangeId } from '../domain/captured-range.js';
import type {
  GifExtractionSession,
  GifRangeView,
  GifThumbnailState,
  IGifExtractionSessionSnapshot,
} from '../app/gif-extraction-session.js';
import type { IAppPanelContent } from './app-screen.js';

type GifRangesPanelControlOptions = {
  readonly document?: Document;
  readonly onRefine?: (rangeId: CapturedRangeId) => void;
};

export class GifRangesPanelControl implements IAppPanelContent {
  private readonly document: Document;
  private readonly unsubscribe: () => void;
  private readonly clickListener = (event: Event): void => this.onClick(event);
  private readonly doubleClickListener = (event: MouseEvent): void => this.onDoubleClick(event);
  private readonly keydownListener = (event: KeyboardEvent): void => this.onKeyDown(event);
  private latestSnapshot: IGifExtractionSessionSnapshot | null = null;
  private mode: Readonly<{ kind: 'all' }> | Readonly<{
    kind: 'needs-refinement';
    retainedRangeId: CapturedRangeId;
  }> = Object.freeze({ kind: 'all' });

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GifExtractionSession,
    private readonly options: GifRangesPanelControlOptions = {},
  ) {
    this.document = options.document ?? document;
    this.root.addEventListener('click', this.clickListener);
    this.root.addEventListener('dblclick', this.doubleClickListener);
    this.root.addEventListener('keydown', this.keydownListener);
    this.unsubscribe = session.subscribe(snapshot => this.render(snapshot));
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
  }

  destroy(): void {
    this.unsubscribe();
    this.root.removeEventListener('click', this.clickListener);
    this.root.removeEventListener('dblclick', this.doubleClickListener);
    this.root.removeEventListener('keydown', this.keydownListener);
    this.root.replaceChildren();
  }

  showAll(): void {
    this.mode = Object.freeze({ kind: 'all' });
    if (this.latestSnapshot) this.render(this.latestSnapshot);
  }

  showNeedsRefinement(retainedRangeId: CapturedRangeId): void {
    this.mode = Object.freeze({ kind: 'needs-refinement', retainedRangeId });
    if (this.latestSnapshot) this.render(this.latestSnapshot);
  }

  focusRange(rangeId: CapturedRangeId): boolean {
    const card = [...this.root.querySelectorAll<HTMLElement>('[data-range-id]')]
      .find(candidate => candidate.dataset.rangeId === rangeId);
    card?.focus();
    return card !== undefined;
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.latestSnapshot = snapshot;
    const exactCount = snapshot.ranges.filter(range => range.kind === 'ready-to-extract').length;
    const extractableCount = snapshot.extractionAvailable === true
      ? snapshot.ranges.filter(range => range.kind === 'ready-to-extract'
        && ['pending', 'failed', 'cancelled'].includes(range.extraction?.kind ?? 'pending')).length
      : 0;
    const completedCount = snapshot.ranges.filter(range => range.extraction?.kind === 'completed').length;
    const attentionCount = snapshot.ranges.filter(range => range.extraction?.kind === 'failed'
      || range.extraction?.kind === 'publication-failed').length;
    const inexactCount = snapshot.ranges.length - exactCount;
    const visibleRanges = snapshot.ranges
      .map((range, index) => Object.freeze({ range, number: index + 1 }))
      .filter(({ range }) => this.mode.kind === 'all'
        || range.kind === 'needs-exact-frames'
        || range.id === this.mode.retainedRangeId);
    const fragment = this.document.createDocumentFragment();
    fragment.append(this.renderHeader(
      exactCount, inexactCount, extractableCount, completedCount, attentionCount, snapshot.extractionAvailable === true));
    const hasDraft = this.mode.kind === 'all' && snapshot.capture?.capture.kind === 'draft'
      && (snapshot.capture.capture.start !== null || snapshot.capture.capture.end !== null);
    if (!hasDraft && visibleRanges.length === 0) {
      const empty = this.document.createElement('p');
      empty.className = 'gif-ranges-empty';
      empty.textContent = this.mode.kind === 'needs-refinement'
        ? 'No ranges need exact frames.'
        : snapshot.source
          ? 'Mark Start with Q, End with W, then lock the range with A.'
          : 'No captured ranges yet. Open a movie and lock a range to add it here.';
      fragment.append(empty);
    } else {
      const list = this.document.createElement('div');
      list.className = 'gif-range-list';
      list.setAttribute('role', 'list');
      if (hasDraft && snapshot.capture?.capture.kind === 'draft') {
        list.append(this.renderDraft(snapshot.capture.capture.start, snapshot.capture.capture.end, snapshot.draftThumbnail));
      }
      visibleRanges.forEach(({ range, number }) => {
        list.append(this.renderRange(range, number, snapshot.selectedRangeId === range.id));
      });
      fragment.append(list);
    }
    this.root.replaceChildren(fragment);
  }

  private renderHeader(
    exactCount: number,
    inexactCount: number,
    extractableCount: number,
    completedCount: number,
    attentionCount: number,
    available: boolean,
  ): HTMLElement {
    const header = this.document.createElement('header');
    header.className = 'gif-ranges-summary';
    const copy = this.document.createElement('div');
    copy.innerHTML = `<strong>${exactCount} exact</strong><span>${inexactCount} need frames</span>`;
    const extract = this.document.createElement('button');
    extract.type = 'button';
    extract.dataset.extractAll = 'true';
    extract.textContent = extractableCount > 0 ? `Extract All (${extractableCount})` : 'Extract All';
    extract.disabled = !available || extractableCount === 0;
    extract.title = !available
      ? 'Extraction is unavailable in this host.'
      : extractableCount > 0 ? 'Extract every actionable exact range'
        : attentionCount > 0 ? 'Resolve the failed ranges below.'
          : exactCount > 0 && completedCount === exactCount ? 'All exact ranges are already extracted.'
            : 'Lock an exact range before extracting.';
    extract.setAttribute('aria-describedby', 'gif-extract-all-hint');
    const hint = this.document.createElement('span');
    hint.id = 'gif-extract-all-hint';
    hint.className = 'sr-only';
    hint.textContent = extract.title;
    header.append(copy, extract, hint);
    return header;
  }

  private renderDraft(
    start: CaptureEndpoint | null,
    end: CaptureEndpoint | null,
    thumbnail: GifThumbnailState,
  ): HTMLElement {
    const card = this.document.createElement('article');
    card.className = 'gif-range-card is-draft';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', 'Current range draft');
    card.append(this.renderThumbnail(thumbnail, null));
    const body = this.document.createElement('div');
    body.className = 'gif-range-body';
    body.innerHTML = `
      <div class="gif-range-card-heading"><strong>Current draft</strong><span class="gif-range-state">Unlocked</span></div>
      <div class="gif-range-endpoints"><span>Start ${this.endpointText(start)}</span><span>End ${this.endpointText(end)}</span></div>
      <p>Set both endpoints, then press A to lock.</p>`;
    card.append(body);
    return card;
  }

  private renderRange(range: GifRangeView, number: number, selected: boolean): HTMLElement {
    const extractionState = range.extraction ?? Object.freeze({ kind: 'pending' as const });
    const card = this.document.createElement('article');
    card.className = `gif-range-card ${range.kind === 'needs-exact-frames' ? 'is-inexact' : 'is-exact'}${selected ? ' is-selected' : ''}`;
    card.dataset.rangeId = range.id;
    card.dataset.rangeKind = range.kind;
    card.tabIndex = 0;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Range ${number}, ${range.kind === 'needs-exact-frames'
      ? 'needs exact frames' : this.extractionText(extractionState)}`);
    if (selected) card.setAttribute('aria-current', 'true');
    card.append(this.renderThumbnail(range.thumbnail, range.id));
    const body = this.document.createElement('div');
    body.className = 'gif-range-body';
    const status = this.document.createElement('div');
    status.className = 'gif-range-card-heading';
    const title = this.document.createElement('strong');
    title.textContent = `Range ${number}`;
    const state = this.document.createElement('span');
    state.className = 'gif-range-state';
    state.innerHTML = range.kind === 'needs-exact-frames'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>Needs exact frames'
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="9" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>${this.extractionStateLabel(extractionState)}`;
    status.append(title, state);
    const endpoints = this.document.createElement('div');
    endpoints.className = 'gif-range-endpoints';
    endpoints.innerHTML = `<span>Start ${this.endpointText(range.start)}</span><span>End ${this.endpointText(range.end)}</span>`;
    const duration = this.document.createElement('p');
    duration.textContent = this.durationText(range.start, range.end);
    body.append(status, endpoints, duration);
    if (range.kind === 'needs-exact-frames') {
      const actions = this.document.createElement('div');
      actions.className = 'gif-range-actions';
      const refine = this.document.createElement('button');
      refine.type = 'button';
      refine.dataset.refineRange = range.id;
      refine.textContent = 'Refine';
      refine.setAttribute('aria-label', `Refine range ${number}`);
      actions.append(refine);
      body.append(actions);
    } else {
      const extraction = this.document.createElement('p');
      extraction.className = `gif-range-extraction is-${extractionState.kind}`;
      extraction.setAttribute('role', 'status');
      extraction.textContent = this.extractionText(extractionState);
      body.append(extraction);
      if (extractionState.kind !== 'completed') {
        const actions = this.document.createElement('div');
        actions.className = 'gif-range-actions';
        const action = this.document.createElement('button');
        action.type = 'button';
        if (extractionState.kind === 'publication-failed') {
          action.dataset.retryPublication = range.id;
          action.textContent = 'Retry save';
        } else {
          action.dataset.extractRange = range.id;
          action.textContent = extractionState.kind === 'failed' || extractionState.kind === 'cancelled'
            ? 'Retry extraction' : 'Extract';
        }
        action.disabled = extractionState.kind === 'extracting' || extractionState.kind === 'publishing';
        actions.append(action);
        body.append(actions);
      }
    }
    card.append(body);
    return card;
  }

  private renderThumbnail(state: GifThumbnailState, rangeId: CapturedRangeId | null): HTMLElement {
    const frame = this.document.createElement('div');
    frame.className = 'gif-range-thumbnail';
    if (state.kind === 'ready') {
      const image = this.document.createElement('img');
      image.src = state.url;
      image.alt = 'Captured start frame';
      frame.append(image);
    } else if (state.kind === 'loading') {
      frame.classList.add('is-loading');
      frame.setAttribute('aria-label', 'Preparing start thumbnail');
    } else if (state.kind === 'missing') {
      const retry = this.document.createElement('button');
      retry.type = 'button';
      retry.dataset.retryThumbnail = rangeId ?? '';
      retry.textContent = 'Retry thumbnail';
      retry.disabled = rangeId === null;
      frame.append(retry);
    } else {
      frame.textContent = 'Start not set';
    }
    return frame;
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-extract-all]')) {
      void this.session.extractAll();
      return;
    }
    const extractRange = target.closest<HTMLElement>('[data-extract-range]');
    if (extractRange?.dataset.extractRange) {
      void this.session.extractRange(extractRange.dataset.extractRange as CapturedRangeId);
      return;
    }
    const retryPublication = target.closest<HTMLElement>('[data-retry-publication]');
    if (retryPublication?.dataset.retryPublication) {
      void this.session.retryExtractionPublication(retryPublication.dataset.retryPublication as CapturedRangeId);
      return;
    }
    const refine = target.closest<HTMLElement>('[data-refine-range]');
    if (refine?.dataset.refineRange) {
      const rangeId = refine.dataset.refineRange as CapturedRangeId;
      this.session.selectRange(rangeId);
      this.options.onRefine?.(rangeId);
      return;
    }
    const retry = target.closest<HTMLElement>('[data-retry-thumbnail]');
    if (retry?.dataset.retryThumbnail) {
      void this.session.retryThumbnail(retry.dataset.retryThumbnail as CapturedRangeId);
      return;
    }
    const card = target.closest<HTMLElement>('[data-range-id]');
    if (card?.dataset.rangeId) this.session.selectRange(card.dataset.rangeId as CapturedRangeId);
  }

  private onDoubleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button')) return;
    const card = target.closest<HTMLElement>('[data-range-id][data-range-kind="needs-exact-frames"]');
    if (!card?.dataset.rangeId) return;
    const rangeId = card.dataset.rangeId as CapturedRangeId;
    this.session.selectRange(rangeId);
    this.options.onRefine?.(rangeId);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button')) return;
    const card = target.closest<HTMLElement>('[data-range-id]');
    if (!card?.dataset.rangeId) return;
    event.preventDefault();
    this.session.selectRange(card.dataset.rangeId as CapturedRangeId);
  }

  private endpointText(endpoint: CaptureEndpoint | null): string {
    if (!endpoint) return '—';
    return endpoint.kind === 'exact-frame'
      ? `frame ${endpoint.identity.frameIndex.toLocaleString()}`
      : this.timeText(endpoint.timestampUs);
  }

  private durationText(start: CaptureEndpoint, end: CaptureEndpoint): string {
    const duration = CaptureEndpointValue.positionUs(end) - CaptureEndpointValue.positionUs(start);
    return `${this.timeText(duration)} selected`;
  }

  private extractionText(state: NonNullable<GifRangeView['extraction']>): string {
    switch (state.kind) {
      case 'extracting': return 'Encoding from the original movie…';
      case 'publishing': return 'Adding the clip to its collection…';
      case 'completed': return `Extracted as ${state.media.filename}`;
      case 'failed': return `Extraction failed: ${state.message}`;
      case 'publication-failed': return `Clip created; collection save failed: ${state.message}`;
      case 'cancelled': return 'Extraction cancelled. Ready to retry.';
      default: return 'Ready for exact extraction';
    }
  }

  private extractionStateLabel(state: NonNullable<GifRangeView['extraction']>): string {
    switch (state.kind) {
      case 'extracting': return 'Extracting';
      case 'publishing': return 'Saving clip';
      case 'completed': return 'Extracted';
      case 'failed': return 'Extraction failed';
      case 'publication-failed': return 'Save failed';
      case 'cancelled': return 'Ready to retry';
      default: return 'Ready to extract';
    }
  }

  private timeText(timeUs: bigint): string {
    const totalMs = Number(timeUs / 1_000n);
    const minutes = Math.floor(totalMs / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    const milliseconds = totalMs % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }
}
