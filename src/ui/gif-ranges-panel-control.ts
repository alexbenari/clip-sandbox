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
  private readonly keydownListener = (event: KeyboardEvent): void => this.onKeyDown(event);
  private latestSnapshot: IGifExtractionSessionSnapshot | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GifExtractionSession,
    private readonly options: GifRangesPanelControlOptions = {},
  ) {
    this.document = options.document ?? document;
    this.root.addEventListener('click', this.clickListener);
    this.root.addEventListener('keydown', this.keydownListener);
    this.unsubscribe = session.subscribe(snapshot => this.render(snapshot));
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
  }

  destroy(): void {
    this.unsubscribe();
    this.root.removeEventListener('click', this.clickListener);
    this.root.removeEventListener('keydown', this.keydownListener);
    this.root.replaceChildren();
  }

  focusRange(rangeId: CapturedRangeId): boolean {
    const card = [...this.root.querySelectorAll<HTMLElement>('[data-range-id]')]
      .find(candidate => candidate.dataset.rangeId === rangeId);
    card?.focus();
    return card !== undefined;
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.latestSnapshot = snapshot;
    const exactCount = snapshot.ranges.filter(range => range.kind !== 'needs-exact-frames').length;
    const extractableCount = snapshot.extractionAvailable === true && !snapshot.capturesLoading
      && snapshot.lifecycle === 'open'
      ? snapshot.ranges.filter(range => this.session.canExtractRange(range.id)).length
      : 0;
    const completedCount = snapshot.ranges.filter(range => range.extraction?.kind === 'completed').length;
    const attentionCount = snapshot.ranges.filter(range => range.extraction?.kind === 'failed'
      || range.extraction?.kind === 'publication-failed').length;
    const inexactCount = snapshot.ranges.length - exactCount;
    const visibleRanges = snapshot.ranges.map((range, index) => Object.freeze({ range, number: index + 1 }));
    const fragment = this.document.createDocumentFragment();
    fragment.append(this.renderHeader(
      exactCount, inexactCount, extractableCount, completedCount, attentionCount,
      snapshot.extractionAvailable === true && !snapshot.capturesLoading && snapshot.lifecycle === 'open',
      snapshot.lifecycle === 'choosing' || snapshot.lifecycle === 'opening' || snapshot.capturesLoading));
    if (snapshot.lifecycle === 'opening' && !snapshot.capturesLoading) {
      const opening = this.document.createElement('p');
      opening.className = 'gif-ranges-loading';
      opening.setAttribute('role', 'status');
      opening.textContent = snapshot.source
        ? 'Opening another movie… These captures remain with the current movie.'
        : 'Opening movie…';
      fragment.append(opening);
    }
    if (snapshot.capturesLoading) {
      const loading = this.document.createElement('p');
      loading.className = 'gif-ranges-loading';
      loading.setAttribute('role', 'status');
      loading.textContent = snapshot.lifecycle === 'opening'
        ? 'Opening saved movie… Playback will be available when it opens.'
        : !snapshot.source
          ? 'Checking for a saved movie… Playback will be available when it opens.'
          : snapshot.reviewState?.captureEnabled
            ? 'Checking for saved captures… You can play the movie during the check.'
            : 'Preparing movie before checking for saved captures…';
      fragment.append(loading);
    }
    const hasDraft = snapshot.capture?.capture.kind === 'draft'
      && (snapshot.capture.capture.start !== null || snapshot.capture.capture.end !== null);
    if (!snapshot.capturesLoading && snapshot.lifecycle !== 'opening' && !hasDraft && visibleRanges.length === 0) {
      const empty = this.document.createElement('p');
      empty.className = 'gif-ranges-empty';
      empty.textContent = snapshot.source
        ? 'Mark Start with Q, End with W, then lock the range with A.'
        : 'No captured ranges yet. Open a movie and lock a range to add it here.';
      fragment.append(empty);
    } else if (hasDraft || visibleRanges.length > 0) {
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
    loading: boolean,
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
      ? loading ? 'Wait for the movie and saved captures to open.' : 'Extraction is unavailable in this host.'
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
    card.append(
      this.renderThumbnail(thumbnail, null, { hasStart: start !== null }),
      this.renderLockIcon(false, 'Unlocked range draft'),
      this.renderRemoveButton(null, 'Remove current draft capture', !this.session.canRemoveDraft()),
    );
    const body = this.document.createElement('div');
    body.className = 'gif-range-body';
    body.append(this.renderRangeDetails(start, end));
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
      ? 'unlocked range; exact frames required' : 'locked exact range'}`);
    if (selected) card.setAttribute('aria-current', 'true');
    card.append(
      this.renderThumbnail(range.thumbnail, range.id, { unavailable: range.validation === 'stale' }),
      this.renderLockIcon(range.kind !== 'needs-exact-frames', range.kind !== 'needs-exact-frames'
        ? 'Locked exact range' : 'Unlocked range; exact frames required'),
      this.renderRemoveButton(range.id, `Remove capture ${number}`, !this.session.canRemoveRange(range.id),
        extractionState.kind === 'completed' ? 'Remove this capture. The extracted clip stays saved.' : undefined),
    );
    const body = this.document.createElement('div');
    body.className = 'gif-range-body';
    body.append(this.renderRangeDetails(range.start, range.end));
    if (range.validation === 'stale') {
      const warning = this.document.createElement('p');
      warning.className = 'gif-range-extraction is-failed';
      warning.textContent = 'Saved frames are unavailable. Use Open movie to find the original.';
      body.append(warning);
    }
    const actions = this.document.createElement('div');
    actions.className = 'gif-range-actions';
    const refine = this.document.createElement('button');
    refine.type = 'button';
    refine.dataset.refineRange = range.id;
    refine.textContent = 'Refine';
    refine.disabled = range.validation === 'stale' || this.latestSnapshot?.lifecycle !== 'open';
    refine.setAttribute('aria-label', `Refine range ${number}`);
    actions.append(refine);
    if (range.kind !== 'needs-exact-frames') {
      if (extractionState.kind !== 'pending') {
        const extraction = this.document.createElement('p');
        extraction.className = `gif-range-extraction is-${extractionState.kind}`;
        extraction.setAttribute('role', 'status');
        extraction.textContent = this.extractionText(extractionState);
        body.append(extraction);
      }
      if (extractionState.kind !== 'completed') {
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
        action.disabled = range.validation === 'stale' || this.latestSnapshot?.lifecycle !== 'open'
          || extractionState.kind === 'extracting' || extractionState.kind === 'publishing';
        actions.append(action);
      }
    }
    body.append(actions);
    card.append(body);
    return card;
  }

  private renderRangeDetails(start: CaptureEndpoint | null, end: CaptureEndpoint | null): HTMLElement {
    const details = this.document.createElement('div');
    details.className = 'gif-range-details';
    const endpoints = this.document.createElement('span');
    endpoints.textContent = `${this.endpointText(start)} – ${this.endpointText(end)}`;
    details.append(endpoints);
    if (start && end) {
      const duration = this.document.createElement('span');
      duration.textContent = this.durationText(start, end);
      details.append(duration);
    }
    return details;
  }

  private renderLockIcon(locked: boolean, label: string): HTMLElement {
    const icon = this.document.createElement('span');
    icon.className = `gif-range-lock ${locked ? 'is-locked' : 'is-unlocked'}`;
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', label);
    icon.title = label;
    icon.innerHTML = locked
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="9" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="9" rx="2"/><path d="M9 10V7a3 3 0 0 1 5.2-2.1"/></svg>';
    return icon;
  }

  private renderRemoveButton(
    rangeId: CapturedRangeId | null,
    label: string,
    disabled: boolean,
    enabledTitle = 'Remove this capture',
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'gif-range-remove';
    if (rangeId === null) button.dataset.removeDraft = 'true';
    else button.dataset.removeRange = rangeId;
    button.setAttribute('aria-label', label);
    button.title = disabled ? 'Wait until captures are loaded and extraction has finished.' : enabledTitle;
    button.disabled = disabled;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    return button;
  }

  private renderThumbnail(
    state: GifThumbnailState,
    rangeId: CapturedRangeId | null,
    options: Readonly<{ unavailable?: boolean; hasStart?: boolean }> = {},
  ): HTMLElement {
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
      retry.disabled = rangeId === null || options.unavailable === true;
      frame.append(retry);
    } else {
      frame.textContent = options.hasStart ? 'Preview unavailable' : 'Start not set';
    }
    return frame;
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-remove-draft]')) {
      this.session.removeDraft();
      return;
    }
    const remove = target.closest<HTMLElement>('[data-remove-range]');
    if (remove?.dataset.removeRange) {
      this.session.removeRange(remove.dataset.removeRange as CapturedRangeId);
      return;
    }
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
    if (!card?.dataset.rangeId) return;
    const rangeId = card.dataset.rangeId as CapturedRangeId;
    this.session.selectRange(rangeId);
    if (event instanceof MouseEvent && event.detail >= 2) this.options.onRefine?.(rangeId);
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
    if (endpoint.kind === 'exact-frame') return `frame ${endpoint.identity.frameIndex.toLocaleString()}`;
    if (endpoint.kind === 'saved-exact-frame') return `frame ${endpoint.frameIndex.toLocaleString()}`;
    return this.timeText(endpoint.timestampUs);
  }

  private durationText(start: CaptureEndpoint, end: CaptureEndpoint): string {
    const duration = CaptureEndpointValue.positionUs(end) - CaptureEndpointValue.positionUs(start);
    const seconds = duration / 1_000_000n;
    const milliseconds = (duration % 1_000_000n) / 1_000n;
    return `(${seconds}.${String(milliseconds).padStart(3, '0')} sec)`;
  }

  private extractionText(state: NonNullable<GifRangeView['extraction']>): string {
    switch (state.kind) {
      case 'extracting': return 'Encoding from the original movie…';
      case 'publishing': return 'Adding the clip to its collection…';
      case 'completed': return `Extracted as ${state.media.filename}`;
      case 'failed': return `Extraction failed: ${state.message}`;
      case 'publication-failed': return `Clip created; collection save failed: ${state.message}`;
      case 'cancelled': return 'Extraction cancelled. Ready to retry.';
      case 'pending': return '';
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
