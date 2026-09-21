import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import { CaptureEndpointValue, type CaptureEndpoint } from '../domain/capture-endpoint.js';
import type { CapturedRange, CapturedRangeId } from '../domain/captured-range.js';
import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type { IClipExtractionService } from '../frame-review/clip-extraction-api.js';
import { ClipExtractor } from '../business-logic/clip-extractor.js';
import {
  RangeCaptureModel,
  type IRangeCaptureSnapshot,
  type RangeCaptureTransition,
} from '../domain/range-capture-model.js';
import type { IFrameReviewDisplayedCapture } from '../ui/frame-review-player-control.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';
import {
  RefineGifSession,
  type IRefineGifCommitRequest,
  type IRefineGifSessionOwner,
  type IRefineGifSessionSnapshot,
  type RefineGifCommitResult,
} from './refine-gif-session.js';
import { ClipExtractionWorkflow, type ClipExtractionEntryState } from './clip-extraction-workflow.js';
import { ExtractionDestinationSession, type IExtractionDestinationPublication } from './extraction-destination-session.js';
import { GifCaptureThumbnailSession, type GifThumbnailState } from './gif-capture-thumbnail-session.js';

export type { IThumbnailCacheService } from './thumbnail-cache-service.js';
export type { GifThumbnailState } from './gif-capture-thumbnail-session.js';

export type GifRangeView = CapturedRange & Readonly<{
  thumbnail: GifThumbnailState;
  extraction?: ClipExtractionEntryState;
}>;

export interface IGifExtractionSessionSnapshot {
  readonly lifecycle: 'empty' | 'choosing' | 'opening' | 'open' | 'failed' | 'disposed';
  readonly source: IFrameReviewSourceSelection | null;
  readonly reviewState: IFrameReviewState | null;
  readonly capture: IRangeCaptureSnapshot | null;
  readonly draftThumbnail: GifThumbnailState;
  readonly ranges: readonly GifRangeView[];
  readonly selectedRangeId: CapturedRangeId | null;
  readonly refinement: IRefineGifSessionSnapshot | null;
  readonly extractionAvailable?: boolean;
  readonly message: string | null;
}

export type OpenMovieResult = 'opened' | 'cancelled' | 'kept-current' | 'failed' | 'busy';
export type BeginRefinementResult =
  | Readonly<{ kind: 'started'; session: RefineGifSession }>
  | Readonly<{ kind: 'rejected'; message: string }>;
export type ConfirmSourceReplacement = (nextMovieName: string) => Promise<boolean>;

type GifExtractionSessionOptions = {
  readonly previewBounds?: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly onProgress?: (message: string) => void;
  readonly onSuccess?: (message: string) => void;
  readonly onError?: (message: string, error?: unknown) => void;
  readonly extractionService?: IClipExtractionService;
  readonly onCollectionPublished?: (publication: IExtractionDestinationPublication) => Promise<void> | void;
};

export class GifExtractionSession implements IRefineGifSessionOwner {
  private readonly listeners = new Set<(snapshot: IGifExtractionSessionSnapshot) => void>();
  private readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  private readonly captureThumbnails: GifCaptureThumbnailSession;
  private lifecycle: IGifExtractionSessionSnapshot['lifecycle'] = 'empty';
  private source: IFrameReviewSourceSelection | null = null;
  private review: IFrameReviewSession | null = null;
  private unsubscribeReview: (() => void) | null = null;
  private reviewState: IFrameReviewState | null = null;
  private rangeModel: RangeCaptureModel | null = null;
  private sourceGeneration = 0;
  private message: string | null = null;
  private selectedRangeId: CapturedRangeId | null = null;
  private activeRefinement: RefineGifSession | null = null;
  private extractionWorkflow: ClipExtractionWorkflow | null = null;
  private disposed = false;
  private opening = false;

  constructor(
    private readonly frameReview: IFrameReviewService,
    thumbnails: IThumbnailCacheService,
    private readonly options: GifExtractionSessionOptions = {},
  ) {
    this.previewBounds = options.previewBounds ?? Object.freeze({ maxWidth: 1280, maxHeight: 720 });
    this.captureThumbnails = new GifCaptureThumbnailSession(thumbnails, {
      onChanged: () => this.publish(),
      onError: (message, error) => this.options.onError?.(message, error),
    });
  }

  get reviewSession(): IFrameReviewSession | null { return this.review; }
  get refinementSession(): RefineGifSession | null { return this.activeRefinement; }

  get snapshot(): IGifExtractionSessionSnapshot {
    const capture = this.rangeModel?.snapshot ?? null;
    const ranges = capture?.ranges.map(range => Object.freeze({
      ...range,
      thumbnail: this.captureThumbnails.stateForRange(range.id),
      extraction: this.extractionWorkflow?.state(range.id) ?? Object.freeze({ kind: 'pending' as const }),
    })) ?? [];
    return Object.freeze({
      lifecycle: this.lifecycle,
      source: this.source,
      reviewState: this.reviewState,
      capture,
      draftThumbnail: this.captureThumbnails.draftState,
      ranges: Object.freeze(ranges),
      selectedRangeId: this.selectedRangeId,
      refinement: this.activeRefinement?.snapshot ?? null,
      extractionAvailable: this.extractionWorkflow !== null,
      message: this.message,
    });
  }

  subscribe(listener: (snapshot: IGifExtractionSessionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async openMovie(confirmReplacement?: ConfirmSourceReplacement): Promise<OpenMovieResult> {
    if (this.disposed || this.opening) return 'busy';
    this.opening = true;
    this.lifecycle = 'choosing';
    this.message = 'Choose a movie';
    this.publish();
    try {
      const selected = await this.frameReview.chooseSource();
      if (!selected) {
        this.restoreOpenLifecycle();
        return 'cancelled';
      }
      if (this.hasCapturedIntent()) {
        const discard = confirmReplacement ? await confirmReplacement(selected.name) : false;
        if (!discard) {
          this.restoreOpenLifecycle();
          return 'kept-current';
        }
      }
      this.lifecycle = 'opening';
      this.message = `Opening ${selected.name}`;
      this.options.onProgress?.(this.message);
      this.publish();
      const candidate = await this.frameReview.open({ sourceHandle: selected.sourceHandle, previewBounds: this.previewBounds });
      await this.replaceSource(selected, candidate);
      this.options.onSuccess?.(`Opened ${selected.name}.`);
      return 'opened';
    } catch (error) {
      this.lifecycle = this.source ? 'open' : 'failed';
      this.message = error instanceof Error ? error.message : 'The movie could not be opened.';
      this.options.onError?.('The movie could not be opened.', error);
      this.publish();
      return 'failed';
    } finally {
      this.opening = false;
    }
  }

  markStart(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !capture || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markStart(endpoint);
    if (transition.kind === 'marked-start') this.captureThumbnails.replaceDraft(capture.thumbnail);
    this.message = transition.kind === 'rejected' ? transition.message : 'Start marked';
    this.publish();
    return transition;
  }

  markEnd(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markEnd(endpoint);
    this.message = transition.kind === 'rejected' ? transition.message : 'End marked';
    this.publish();
    return transition;
  }

  lockRange(): RangeCaptureTransition {
    if (!this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.lockRange();
    if (transition.kind === 'locked') this.captureThumbnails.commitDraftToRange(transition.range.id);
    if (transition.kind === 'locked') this.selectedRangeId = transition.range.id;
    this.message = transition.kind === 'rejected' ? transition.message : 'Range locked';
    this.publish();
    return transition;
  }

  async retryThumbnail(rangeId: CapturedRangeId): Promise<void> {
    await this.captureThumbnails.retryRange(rangeId);
  }

  selectRange(rangeId: CapturedRangeId): void {
    if (!this.rangeModel?.snapshot.ranges.some(range => range.id === rangeId)) return;
    this.selectedRangeId = rangeId;
    this.publish();
  }

  canExtractRange(rangeId: CapturedRangeId): boolean {
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range || range.kind !== 'ready-to-extract' || !this.extractionWorkflow) return false;
    const state = this.extractionWorkflow.state(rangeId);
    return state.kind === 'pending' || state.kind === 'failed' || state.kind === 'cancelled';
  }

  async extractRange(rangeId: CapturedRangeId): Promise<void> {
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range || !this.canExtractRange(rangeId)) return;
    await this.runExtraction(() => this.extractionWorkflow!.extractOne({
      sourceHandle: this.source!.sourceHandle,
      sourceGeneration: this.sourceGeneration,
      range: range as IReadyToExtractRange,
      collectionName: this.collectionName(),
    }));
  }

  async extractAll(): Promise<void> {
    const ranges = (this.rangeModel?.snapshot.ranges ?? []).filter(
      (range): range is IReadyToExtractRange => range.kind === 'ready-to-extract' && this.canExtractRange(range.id));
    if (ranges.length === 0 || !this.extractionWorkflow || !this.source) return;
    await this.runExtraction(() => this.extractionWorkflow!.extractAll({
      sourceHandle: this.source!.sourceHandle,
      sourceGeneration: this.sourceGeneration,
      ranges,
      collectionName: this.collectionName(),
    }));
  }

  async retryExtractionPublication(rangeId: CapturedRangeId): Promise<void> {
    if (this.extractionWorkflow?.state(rangeId).kind !== 'publication-failed') return;
    await this.runExtraction(() => this.extractionWorkflow!.retryPublication(rangeId));
  }

  async cancelExtraction(): Promise<void> {
    await this.extractionWorkflow?.cancel();
  }

  beginRefinement(rangeId: CapturedRangeId): BeginRefinementResult {
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range || range.kind !== 'needs-exact-frames') {
      return this.rejectRefinement('Choose a range that needs exact frames.');
    }
    if (!this.reviewState?.captureEnabled || range.sourceGeneration !== this.sourceGeneration) {
      return this.rejectRefinement('Exact frame review is not ready for this range.');
    }
    this.activeRefinement = new RefineGifSession(this, range);
    this.selectedRangeId = rangeId;
    this.message = 'Refine the approximate endpoint against exact frames.';
    this.publish();
    return Object.freeze({ kind: 'started', session: this.activeRefinement });
  }

  abandonRefinement(): CapturedRangeId | null {
    const rangeId = this.activeRefinement?.snapshot.rangeId ?? null;
    this.activeRefinement = null;
    this.message = null;
    this.publish();
    return rangeId;
  }

  removeRange(rangeId: CapturedRangeId): boolean {
    const removed = this.rangeModel?.removeRange(rangeId) ?? null;
    if (!removed) return false;
    this.captureThumbnails.removeRange(rangeId);
    if (this.selectedRangeId === rangeId) this.selectedRangeId = null;
    if (this.activeRefinement?.snapshot.rangeId === rangeId) {
      this.activeRefinement.invalidate('The range was removed before this refinement was locked.');
    } else {
      this.publish();
    }
    return true;
  }

  currentSourceGeneration(): number | null {
    return this.rangeModel ? this.sourceGeneration : null;
  }

  exactEndpointFromDisplayedCapture(capture: IFrameReviewDisplayedCapture | null) {
    if (!capture || capture.point.kind !== 'exact-frame' || !this.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.reviewState.sourceGeneration || !this.rangeModel) return null;
    return CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.sourceGeneration);
  }

  commitRefinement(request: IRefineGifCommitRequest): RefineGifCommitResult {
    if (this.activeRefinement !== request.session) {
      return Object.freeze({ kind: 'rejected', message: 'This refinement is no longer active.' });
    }
    if (request.sourceGeneration !== this.sourceGeneration) {
      return Object.freeze({ kind: 'rejected', message: 'The source changed before this refinement was locked.' });
    }
    const current = this.rangeModel?.snapshot.ranges.find(range => range.id === request.rangeId);
    if (!current) {
      return Object.freeze({ kind: 'rejected', message: 'The range was removed before this refinement was locked.' });
    }
    if (current.kind !== 'needs-exact-frames') {
      return Object.freeze({ kind: 'rejected', message: 'This range no longer needs refinement.' });
    }
    const replacement = this.rangeModel?.replaceRangeWithExactEndpoints(request.rangeId, request.start, request.end);
    if (!replacement || replacement.kind !== 'ready-to-extract') {
      return Object.freeze({ kind: 'rejected', message: 'The exact range could not be locked.' });
    }
    if (request.startThumbnail) this.captureThumbnails.replaceRange(request.rangeId, request.startThumbnail);
    this.selectedRangeId = request.rangeId;
    this.message = 'Exact range locked';
    return Object.freeze({ kind: 'committed', range: replacement });
  }

  nextInexactRangeId(afterRangeId: CapturedRangeId): CapturedRangeId | null {
    const ranges = this.rangeModel?.snapshot.ranges ?? [];
    const currentIndex = ranges.findIndex(range => range.id === afterRangeId);
    if (currentIndex < 0) return null;
    return ranges.slice(currentIndex + 1).find(range => range.kind === 'needs-exact-frames')?.id ?? null;
  }

  refinementChanged(session: RefineGifSession): void {
    if (this.activeRefinement === session) this.publish();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycle = 'disposed';
    this.listeners.clear();
    this.unsubscribeReview?.();
    this.unsubscribeReview = null;
    this.activeRefinement = null;
    await this.extractionWorkflow?.cancel();
    this.extractionWorkflow = null;
    const review = this.review;
    this.review = null;
    await Promise.allSettled([review?.dispose(), this.captureThumbnails.dispose()]);
  }

  private async replaceSource(selected: IFrameReviewSourceSelection, candidate: IFrameReviewSession): Promise<void> {
    const previous = this.review;
    await this.extractionWorkflow?.cancel();
    this.unsubscribeReview?.();
    this.unsubscribeReview = null;
    this.activeRefinement?.invalidate('The source changed before this refinement was locked.');
    await this.captureThumbnails.clear();
    this.sourceGeneration += 1;
    this.source = selected;
    this.review = candidate;
    this.reviewState = candidate.state();
    this.rangeModel = new RangeCaptureModel(this.sourceGeneration);
    this.selectedRangeId = null;
    this.activeRefinement = null;
    this.extractionWorkflow = this.options.extractionService
      ? new ClipExtractionWorkflow(
        new ClipExtractor(this.options.extractionService),
        new ExtractionDestinationSession(this.options.extractionService, {
          onCollectionPublished: publication => this.options.onCollectionPublished?.(publication),
          onCollectionPublishedError: error => this.options.onError?.(
            'The clip was saved, but the Collection view could not refresh.',
            error,
          ),
        }),
        () => this.publish(),
      )
      : null;
    this.lifecycle = 'open';
    this.message = this.reviewState.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames';
    let exactReadinessAnnounced = false;
    this.unsubscribeReview = candidate.subscribe(event => {
      if (this.disposed || this.review !== candidate) return;
      if (event.type === 'state') {
        const becameReady = !this.reviewState?.captureEnabled && event.state.captureEnabled;
        this.reviewState = event.state;
        this.message = event.state.captureEnabled ? 'Exact capture ready' : event.state.message;
        const preparationMessage = this.preparationProgressMessage(event.state);
        if (preparationMessage) this.options.onProgress?.(preparationMessage);
        if (becameReady && !exactReadinessAnnounced) {
          exactReadinessAnnounced = true;
          this.announceExactReadiness(event.state);
        }
        this.publish();
      } else if (event.type === 'error') {
        this.options.onError?.(event.message);
      }
    });
    if (this.reviewState.captureEnabled && !exactReadinessAnnounced) {
      exactReadinessAnnounced = true;
      this.announceExactReadiness(this.reviewState);
    }
    this.publish();
    if (previous) await previous.dispose();
  }

  private endpointFromCapture(capture: IFrameReviewDisplayedCapture | null): CaptureEndpoint | null {
    if (!capture || !this.rangeModel || !this.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.reviewState.sourceGeneration) return null;
    return capture.point.kind === 'exact-frame'
      ? CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.sourceGeneration)
      : CaptureEndpointValue.timestamp(capture.point.timestampUs, this.sourceGeneration);
  }

  private collectionName(): string {
    const name = this.source?.name ?? '';
    return name.replace(/\.[^.]+$/, '');
  }

  private preparationProgressMessage(state: IFrameReviewState): string | null {
    if (!this.source) return null;
    let action: string;
    switch (state.phase) {
      case 'playback-ready': action = 'Playback is ready; preparing exact frames for'; break;
      case 'inspecting': action = 'Inspecting source media for'; break;
      case 'cache-validation': action = 'Checking the prepared review cache for'; break;
      case 'normalizing': action = 'Repairing source timestamps for'; break;
      case 'indexing': action = 'Indexing source frames for'; break;
      case 'proxy-encoding': action = 'Creating the exact-review proxy for'; break;
      case 'proxy-indexing': action = 'Indexing the exact-review proxy for'; break;
      case 'validating': action = 'Validating the exact frame map for'; break;
      default: return null;
    }
    const progress = state.progressPercent === null ? '' : ` (${Math.round(state.progressPercent)}%)`;
    return `${action} ${this.source.name}${progress}.`;
  }

  private announceExactReadiness(state: IFrameReviewState): void {
    if (!this.source) return;
    this.options.onSuccess?.(state.preparedReview?.cacheHit
      ? `Reused the prepared review cache for ${this.source.name}.`
      : `Exact capture is ready for ${this.source.name}.`);
  }

  private async runExtraction(operation: () => Promise<void>): Promise<void> {
    this.message = 'Extracting exact range';
    this.options.onProgress?.(this.message);
    this.publish();
    try {
      await operation();
      const failed = (this.rangeModel?.snapshot.ranges ?? []).some(range => {
        const state = this.extractionWorkflow?.state(range.id);
        return state?.kind === 'failed' || state?.kind === 'publication-failed';
      });
      this.message = failed ? 'Some clips need attention' : 'Extraction complete';
      if (failed) this.options.onError?.('Some clips could not be completed. Retry them from Clips.');
      else this.options.onSuccess?.('Exact clips were added to extraction-tmp.');
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Extraction could not start.';
      this.options.onError?.(this.message, error);
    }
    this.publish();
  }

  private hasCapturedIntent(): boolean {
    const snapshot = this.rangeModel?.snapshot;
    if (!snapshot) return false;
    if (snapshot.ranges.length > 0) return true;
    return snapshot.capture.kind === 'draft' && (snapshot.capture.start !== null || snapshot.capture.end !== null);
  }

  private captureUnavailable(): RangeCaptureTransition {
    const message = 'Capture becomes available after exact frame preparation.';
    this.message = message;
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private rejectRefinement(message: string): BeginRefinementResult {
    this.message = message;
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private restoreOpenLifecycle(): void {
    this.lifecycle = this.source ? 'open' : 'empty';
    this.message = this.source ? (this.reviewState?.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames') : null;
    this.publish();
  }

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
