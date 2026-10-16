import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import { CaptureEndpointValue, type CaptureEndpoint, type ISavedExactFrameEndpoint } from '../domain/capture-endpoint.js';
import { CapturedRangeValue, type CapturedRange, type CapturedRangeId } from '../domain/captured-range.js';
import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type { IClipExtractionService } from '../frame-review/clip-extraction-api.js';
import {
  RangeCaptureModel,
  type IRangeCaptureSnapshot,
  type RangeCaptureTransition,
} from '../domain/range-capture-model.js';
import type { IFrameReviewDisplayedCapture } from './frame-review-displayed-capture.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';
import {
  RefineGifSession,
  type IRefineGifCommitRequest,
  type IRefineGifSessionOwner,
  type IRefineGifSessionSnapshot,
  type RefineGifCommitResult,
} from './refine-gif-session.js';
import type { ClipExtractionEntryState, IExtractionBatchProgress } from './clip-extraction-workflow.js';
import type { ActivityInput } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { ExtractionDestination } from './extraction-destination-session.js';
import { GifCaptureThumbnailSession, type GifThumbnailState } from './gif-capture-thumbnail-session.js';
import type { IClipCapturesStoreService } from './clip-captures-store-service.js';
import { SourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
import { SavedCaptureQueuePersistence } from './saved-capture-queue-persistence.js';
import { CurrentMovie } from './current-movie.js';
import { GifSessionStatus } from './gif-session-status.js';
import { RangeExtraction, type IExtractionMovie, type IExtractionPublicationListener } from './range-extraction.js';

export type { IThumbnailCacheService } from './thumbnail-cache-service.js';
export type { GifThumbnailState } from './gif-capture-thumbnail-session.js';

export type GifRangeView = CapturedRange & Readonly<{
  thumbnail: GifThumbnailState;
  extraction?: ClipExtractionEntryState;
  validation?: 'stale';
}>;

export interface IGifPreviewTarget {
  readonly kind: 'draft' | 'locked' | 'refinement';
  readonly rangeId: CapturedRangeId | null;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly sourceGeneration: number;
  readonly revision: number;
}

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
  readonly extractionBatch?: IExtractionBatchProgress | null;
  readonly captureAvailable?: boolean;
  readonly capturesLoading: boolean;
  readonly message: string | null;
  readonly previewTarget: IGifPreviewTarget | null;
  readonly previewRevision: number;
}

export type OpenMovieResult = 'opened' | 'cancelled' | 'failed' | 'busy';
export type BeginRefinementResult =
  | Readonly<{ kind: 'started'; session: RefineGifSession }>
  | Readonly<{ kind: 'rejected'; message: string }>;

export type { IExtractionPublicationListener } from './range-extraction.js';

// Awaited: a failure to position the player is reported by the session.
export interface ICapturePositioning {
  showFrameAfterCapture(review: IFrameReviewSession, endpoint: CaptureEndpoint): Promise<void>;
}

type GifExtractionSessionOptions = {
  readonly previewBounds?: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly reporter?: Pick<ActivityReporter, 'progress' | 'success' | 'failure'>;
  readonly activityLog?: { log(entry: ActivityInput): unknown };
  readonly diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
  readonly capturePositioning?: ICapturePositioning;
  readonly extractionService?: IClipExtractionService;
  readonly captureStore?: IClipCapturesStoreService;
  readonly publications?: IExtractionPublicationListener;
  readonly destination?: ExtractionDestination;
};

type CollectionRefinementOptions = Omit<GifExtractionSessionOptions, 'captureStore'>;

type GifExtractionSessionMode = 'movie-capture' | 'collection-refinement';

export class GifExtractionSession implements IRefineGifSessionOwner {
  private readonly listeners = new Set<(snapshot: IGifExtractionSessionSnapshot) => void>();
  private readonly status = new GifSessionStatus();
  private readonly movie: CurrentMovie;
  private readonly captureThumbnails: GifCaptureThumbnailSession;
  private rangeModel: RangeCaptureModel | null = null;
  private selectedRangeId: CapturedRangeId | null = null;
  private activeRefinement: RefineGifSession | null = null;
  private readonly extraction: RangeExtraction;
  private disposed = false;
  private savedCaptureQueue: SavedCaptureQueuePersistence | null = null;
  private restoringCaptures = false;
  private capturesLoading = false;
  private restoreStarted = false;
  private lastRefinementRevision: number | null = null;

  // GIF Extraction: the user captures ranges from a movie they open; captures are saved when a store is given.
  static forMovieCapture(frameReview: IFrameReviewService, thumbnails: IThumbnailCacheService,
    options: GifExtractionSessionOptions = {}): GifExtractionSession {
    return new GifExtractionSession('movie-capture', frameReview, thumbnails, options);
  }

  // Collection Refine: one range imported from a collection clip, never saved as a capture.
  static forCollectionRefinement(frameReview: IFrameReviewService, thumbnails: IThumbnailCacheService,
    options: CollectionRefinementOptions = {}): GifExtractionSession {
    return new GifExtractionSession('collection-refinement', frameReview, thumbnails, options);
  }

  private constructor(
    private readonly mode: GifExtractionSessionMode,
    frameReview: IFrameReviewService,
    thumbnails: IThumbnailCacheService,
    private readonly options: GifExtractionSessionOptions,
  ) {
    this.movie = new CurrentMovie({
      frameReview,
      previewBounds: options.previewBounds ?? Object.freeze({ maxWidth: 1280, maxHeight: 720 }),
      status: this.status,
      reporter: options.reporter,
      diagnostics: options.diagnostics,
    });
    this.extraction = new RangeExtraction({
      extractionService: options.extractionService,
      destination: options.destination,
      publications: options.publications,
      status: this.status,
      reporter: options.reporter,
      activityLog: options.activityLog,
      diagnostics: options.diagnostics,
    });
    this.extraction.on('extractionStateChanged', () => this.persistQueue());
    this.captureThumbnails = new GifCaptureThumbnailSession(thumbnails, {
      onChanged: () => this.status.changed(),
      onError: (message, error) => this.reportError(message, error),
    });
    this.status.on('changed', () => this.publish());
    this.movie.on('reviewEnded', () => {
      this.restoringCaptures = false;
      this.capturesLoading = false;
    });
    this.movie.on('exactCaptureReady', () => {
      const review = this.movie.review;
      if (review) void this.restoreCaptures(review);
    });
  }

  private reportError(message: string, error?: unknown): void {
    this.options.reporter?.failure(message);
    if (error !== undefined) void this.options.diagnostics?.logRuntimeError(message, error);
  }

  get reviewSession(): IFrameReviewSession | null { return this.movie.review; }
  get refinementSession(): RefineGifSession | null { return this.activeRefinement; }

  setExtractionDestination(destination: ExtractionDestination): void {
    this.extraction.setDestination(destination);
  }

  get snapshot(): IGifExtractionSessionSnapshot {
    const capture = this.rangeModel?.snapshot ?? null;
    const ranges = capture?.ranges.map(range => Object.freeze({
      ...range,
      thumbnail: this.captureThumbnails.stateForRange(range.id),
      extraction: this.extraction.state(range.id),
      validation: this.savedCaptureQueue?.isStale(range.id) ? 'stale' as const : undefined,
    })) ?? [];
    return Object.freeze({
      lifecycle: this.movie.lifecycle,
      source: this.movie.source,
      reviewState: this.movie.reviewState,
      capture,
      draftThumbnail: this.captureThumbnails.draftState,
      ranges: Object.freeze(ranges),
      selectedRangeId: this.selectedRangeId,
      refinement: this.activeRefinement?.snapshot ?? null,
      extractionAvailable: this.extraction.available,
      extractionBatch: this.extraction.batchProgress,
      captureAvailable: this.movie.lifecycle === 'open' && this.movie.reviewState?.captureEnabled === true
        && !this.restoringCaptures && !this.capturesLoading,
      capturesLoading: this.capturesLoading,
      message: this.status.message,
      previewTarget: this.previewTarget(),
      previewRevision: this.status.previewRevision,
    });
  }

  subscribe(listener: (snapshot: IGifExtractionSessionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async openMovie(): Promise<OpenMovieResult> {
    if (this.disposed || !this.movie.beginChange()) return 'busy';
    try {
      const selected = await this.movie.chooseSource();
      if (!selected) return 'cancelled';
      const opening = this.movie.openCandidate(selected);
      this.movie.reportOpening(selected);
      await this.replaceSource(selected, await opening);
      this.movie.reportOpened(selected);
      return 'opened';
    } catch (error) {
      this.capturesLoading = false;
      this.movie.failOpening(error);
      this.publish();
      return 'failed';
    } finally {
      this.movie.endChange();
    }
  }

  async openCollectionSource(selected: IFrameReviewSourceSelection): Promise<void> {
    if (this.disposed || this.extraction.batchProgress || !this.movie.beginChange()) {
      throw new Error('Wait for the current movie or extraction to finish.');
    }
    try {
      await this.replaceSource(selected, await this.movie.openCandidate(selected));
    } finally {
      this.movie.endChange();
      if (this.movie.lifecycle === 'opening') this.movie.restoreLifecycle();
    }
  }

  async importCollectionRange(range: Readonly<{
    start: Readonly<{ frameIndex: number; frameInfoHash: string }>;
    end: Readonly<{ frameIndex: number; frameInfoHash: string }>;
  }>): Promise<BeginRefinementResult> {
    const review = this.movie.review;
    const generation = this.movie.sourceGeneration;
    if (!review || this.mode !== 'collection-refinement') return this.rejectRefinement('Collection refinement is unavailable.');
    await new Promise<void>((resolve, reject) => {
      const current = review.state();
      if (current.captureEnabled) { resolve(); return; }
      if (current.phase === 'failed' || current.phase === 'closed') {
        reject(new Error(current.message ?? 'Exact movie review could not be prepared.'));
        return;
      }
      const unsubscribe = review.subscribe(event => {
        if (event.type !== 'state') return;
        if (event.state.captureEnabled || event.state.phase === 'failed' || event.state.phase === 'closed') {
          unsubscribe();
          if (event.state.captureEnabled) resolve();
          else reject(new Error(event.state.message ?? 'Exact movie review could not be prepared.'));
        }
      });
    });
    if (this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation) {
      return this.rejectRefinement('The source changed while opening the clip.');
    }
    const [start, end] = await Promise.all([
      review.frameIdentity(range.start.frameIndex),
      review.frameIdentity(range.end.frameIndex),
    ]);
    if (start.frameInfoHash !== range.start.frameInfoHash || end.frameInfoHash !== range.end.frameInfoHash) {
      return this.rejectRefinement('The source range no longer matches this clip.');
    }
    const model = RangeCaptureModel.fromSavedData({
      schemaVersion: 1,
      nextRangeSequence: 2,
      ranges: [{ id: 'range-1',
        start: { kind: 'exact-frame', frameIndex: start.frameIndex, frameInfoHash: start.frameInfoHash,
          reviewTimeUs: SourceFrameIdentity.timeUs(start).toString() },
        end: { kind: 'exact-frame', frameIndex: end.frameIndex, frameInfoHash: end.frameInfoHash,
          reviewTimeUs: SourceFrameIdentity.timeUs(end).toString() },
      }],
    }, generation);
    const rangeId = CapturedRangeValue.id(1);
    model.hydrateSavedRange(rangeId, { start, end });
    this.rangeModel = model;
    return this.beginRefinement(rangeId);
  }

  markStart(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.restoringCaptures || this.movie.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !capture || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markStart(endpoint);
    if (transition.kind === 'marked-start') this.status.advancePreview();
    if (transition.kind === 'marked-start') this.captureThumbnails.replaceDraft(capture.thumbnail);
    if (transition.kind === 'marked-start') this.persistQueue();
    this.status.show(transition.kind === 'rejected' ? transition.message : 'Start marked');
    this.publish();
    return transition;
  }

  markEnd(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.restoringCaptures || this.movie.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markEnd(endpoint);
    if (transition.kind === 'marked-end') this.status.advancePreview();
    if (transition.kind === 'marked-end') this.persistQueue();
    this.status.show(transition.kind === 'rejected' ? transition.message : 'End marked');
    this.publish();
    return transition;
  }

  lockRange(): RangeCaptureTransition {
    if (!this.rangeModel || this.restoringCaptures || this.movie.lifecycle !== 'open') return this.captureUnavailable();
    const transition = this.rangeModel.lockRange();
    if (transition.kind === 'locked') this.status.advancePreview();
    if (transition.kind === 'locked') this.captureThumbnails.commitDraftToRange(transition.range.id);
    if (transition.kind === 'locked') this.selectedRangeId = transition.range.id;
    if (transition.kind === 'locked') this.persistQueue();
    this.status.show(transition.kind === 'rejected' ? transition.message : 'Range locked');
    this.publish();
    return transition;
  }

  async prepareSavedDraft(): Promise<boolean> {
    const draft = this.rangeModel?.snapshot.capture;
    const review = this.movie.review;
    const generation = this.movie.sourceGeneration;
    if (!draft || draft.kind !== 'draft') return true;
    const savedStart = draft.start?.kind === 'saved-exact-frame' ? draft.start : null;
    const savedEnd = draft.end?.kind === 'saved-exact-frame' ? draft.end : null;
    if (!savedStart && !savedEnd) return true;
    if (!review?.state().captureEnabled || this.restoringCaptures) return false;
    try {
      const identities = await this.indexedIdentitiesForSavedEndpoints(review, savedStart, savedEnd);
      const current = this.rangeModel?.snapshot.capture;
      if (this.movie.review !== review || this.movie.sourceGeneration !== generation || current?.kind !== 'draft'
        || current.start !== draft.start || current.end !== draft.end) return false;
      if (!this.rangeModel?.hydrateSavedDraft(identities)) {
        throw new Error('Saved draft frames no longer match this movie. Mark new endpoints before locking.');
      }
      this.publish();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Saved draft frames could not be checked.';
      this.status.show(message);
      this.reportError(message, error);
      this.publish();
      return false;
    }
  }

  async retryThumbnail(rangeId: CapturedRangeId): Promise<void> {
    if (this.savedCaptureQueue?.isStale(rangeId)) return;
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === rangeId);
    const review = this.movie.review;
    const generation = this.movie.sourceGeneration;
    if (range && range.start.kind !== 'playback-timestamp' && review?.state().captureEnabled
      && this.captureThumbnails.stateForRange(rangeId).kind === 'missing') {
      const frameIndex = range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex;
      const frame = await review.thumbnailFrame(frameIndex);
      if (this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
      const savedHash = range.start.kind === 'saved-exact-frame' ? range.start.frameInfoHash : range.start.identity.frameInfoHash;
      if (frame.identity.frameInfoHash !== savedHash) return;
      this.captureThumbnails.replaceRange(rangeId, frame);
      return;
    }
    await this.captureThumbnails.retryRange(rangeId);
  }

  selectRange(rangeId: CapturedRangeId): void {
    if (!this.rangeModel?.snapshot.ranges.some(range => range.id === rangeId)) return;
    if (this.selectedRangeId === rangeId) return;
    this.selectedRangeId = rangeId;
    this.status.advancePreview();
    this.publish();
  }

  canExtractRange(rangeId: CapturedRangeId): boolean {
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (this.extraction.destination && this.activeRefinement?.snapshot.rangeId === rangeId
      && this.activeRefinement.snapshot.status !== 'committed') return false;
    if (!range || this.movie.lifecycle !== 'open' || this.savedCaptureQueue?.isStale(rangeId)
      || (range.kind !== 'ready-to-extract' && range.kind !== 'saved-exact-range')) return false;
    return this.extraction.canStart(rangeId);
  }

  async extractRange(rangeId: CapturedRangeId): Promise<void> {
    let range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range || !this.canExtractRange(rangeId)) return;
    if (range.kind === 'saved-exact-range') {
      if (!await this.prepareSavedRange(rangeId)) return;
      range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    }
    const movie = this.extractionMovie();
    if (!range || range.kind !== 'ready-to-extract' || !movie) return;
    await this.extraction.extractOne(movie, range, () => this.queuedRangeIds());
  }

  async extractAll(): Promise<void> {
    for (const range of this.rangeModel?.snapshot.ranges ?? []) {
      if (range.kind === 'saved-exact-range' && this.canExtractRange(range.id)) await this.prepareSavedRange(range.id);
    }
    const ranges = (this.rangeModel?.snapshot.ranges ?? []).filter(
      (range): range is IReadyToExtractRange => range.kind === 'ready-to-extract' && this.canExtractRange(range.id));
    const movie = this.extractionMovie();
    if (!movie) return;
    await this.extraction.extractAll(movie, ranges, () => this.queuedRangeIds());
  }

  async retryExtractionPublication(rangeId: CapturedRangeId): Promise<void> {
    await this.extraction.retryPublication(rangeId, () => this.queuedRangeIds());
  }

  async cancelExtraction(): Promise<void> {
    await this.extraction.cancel();
  }
  beginRefinement(rangeId: CapturedRangeId): BeginRefinementResult {
    if (this.movie.lifecycle !== 'open') return this.rejectRefinement('Wait for the movie to finish opening.');
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range) {
      return this.rejectRefinement('Choose a captured range to refine.');
    }
    if (this.savedCaptureQueue?.isStale(rangeId)) {
      return this.rejectRefinement('Saved frames no longer match this movie. Remove the range or reopen the original movie.');
    }
    if (range.kind === 'saved-exact-range') {
      return this.rejectRefinement('Check the saved range against the movie before refining it.');
    }
    if (!this.movie.reviewState?.captureEnabled || range.sourceGeneration !== this.movie.sourceGeneration) {
      return this.rejectRefinement('Exact frame review is not ready for this range.');
    }
    this.activeRefinement = new RefineGifSession(this, range);
    this.lastRefinementRevision = 0;
    this.status.advancePreview();
    this.selectedRangeId = rangeId;
    this.status.show(range.kind === 'needs-exact-frames'
      ? 'Refine the approximate endpoint against exact frames.'
      : 'Review and adjust exact frames, then lock the range.');
    this.publish();
    return Object.freeze({ kind: 'started', session: this.activeRefinement });
  }

  async prepareSavedRange(rangeId: CapturedRangeId): Promise<boolean> {
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === rangeId);
    const review = this.movie.review;
    const generation = this.movie.sourceGeneration;
    if (!range || !review?.state().captureEnabled || this.savedCaptureQueue?.isStale(rangeId)) return false;
    const savedStart = range.start.kind === 'saved-exact-frame' ? range.start : null;
    const savedEnd = range.end.kind === 'saved-exact-frame' ? range.end : null;
    if (!savedStart && !savedEnd) return true;
    try {
      const identities = await this.indexedIdentitiesForSavedEndpoints(review, savedStart, savedEnd);
      if (this.movie.review !== review || this.movie.sourceGeneration !== generation) return false;
      const hydrated = this.rangeModel?.hydrateSavedRange(rangeId, identities);
      if (!hydrated) {
        this.savedCaptureQueue?.markStale(rangeId);
        throw new Error('Saved frames no longer match this movie. Reopen the original movie.');
      }
      this.savedCaptureQueue?.forgetRange(rangeId);
      this.publish();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Saved frames could not be checked.';
      this.status.show(message);
      this.reportError(message, error);
      this.publish();
      return false;
    }
  }

  abandonRefinement(): CapturedRangeId | null {
    const rangeId = this.activeRefinement?.snapshot.rangeId ?? null;
    this.activeRefinement = null;
    this.lastRefinementRevision = null;
    this.status.advancePreview();
    this.status.show(null);
    this.publish();
    return rangeId;
  }

  removeRange(rangeId: CapturedRangeId): boolean {
    if (!this.canRemoveRange(rangeId)) return false;
    const removed = this.rangeModel?.removeRange(rangeId) ?? null;
    if (!removed) return false;
    this.savedCaptureQueue?.forgetRange(rangeId);
    this.persistQueue();
    this.captureThumbnails.removeRange(rangeId);
    if (this.selectedRangeId === rangeId) this.selectedRangeId = null;
    this.status.advancePreview();
    if (this.activeRefinement?.snapshot.rangeId === rangeId) {
      this.activeRefinement.invalidate('The range was removed before this refinement was locked.');
      this.activeRefinement = null;
    }
    this.publish();
    return true;
  }

  canRemoveRange(rangeId: CapturedRangeId): boolean {
    return this.capturesRemovable()
      && !this.movie.opening && !this.capturesLoading
      && this.rangeModel?.snapshot.ranges.some(range => range.id === rangeId) === true
      && !this.extraction.revisionBlock(rangeId);
  }

  removeDraft(): boolean {
    if (!this.canRemoveDraft() || !this.rangeModel?.discardDraft()) return false;
    this.status.advancePreview();
    this.persistQueue();
    this.captureThumbnails.removeDraft();
    this.publish();
    return true;
  }

  canRemoveDraft(): boolean {
    const capture = this.rangeModel?.snapshot.capture;
    return this.capturesRemovable()
      && !this.movie.opening && !this.capturesLoading
      && capture?.kind === 'draft' && (capture.start !== null || capture.end !== null);
  }

  // Saved captures stay removable while their movie is unavailable; unsaved ones only while the movie is open.
  private capturesRemovable(): boolean {
    return this.options.captureStore
      ? this.savedCaptureQueue?.hasMovieReference === true
      : this.movie.lifecycle === 'open';
  }

  currentSourceGeneration(): number | null {
    return this.rangeModel ? this.movie.sourceGeneration : null;
  }

  exactEndpointFromDisplayedCapture(capture: IFrameReviewDisplayedCapture | null) {
    if (!capture || capture.point.kind !== 'exact-frame' || !this.movie.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.movie.reviewState.sourceGeneration || !this.rangeModel) return null;
    return CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.movie.sourceGeneration);
  }

  commitRefinement(request: IRefineGifCommitRequest): RefineGifCommitResult {
    if (this.activeRefinement !== request.session) {
      return Object.freeze({ kind: 'rejected', message: 'This refinement is no longer active.' });
    }
    if (request.sourceGeneration !== this.movie.sourceGeneration) {
      return Object.freeze({ kind: 'rejected', message: 'The source changed before this refinement was locked.' });
    }
    const current = this.rangeModel?.snapshot.ranges.find(range => range.id === request.rangeId);
    if (!current) {
      return Object.freeze({ kind: 'rejected', message: 'The range was removed before this refinement was locked.' });
    }
    if (current !== request.session.snapshot.original) {
      return Object.freeze({ kind: 'rejected', message: 'This range changed before the refinement was locked.' });
    }
    const changed = !CapturedRangeValue.hasExactFrames(current, request.start, request.end);
    const block = changed ? this.extraction.revisionBlock(request.rangeId) : null;
    if (block) return Object.freeze({ kind: 'rejected', message: block });
    if (!changed && current.kind === 'ready-to-extract') {
      this.selectedRangeId = request.rangeId;
      const message = 'Range unchanged; previous extraction status is preserved.';
      this.status.show(message);
      return Object.freeze({ kind: 'committed', range: current, message });
    }
    const previousExtraction = this.extraction.state(request.rangeId);
    const replacement = this.rangeModel?.replaceRangeWithExactEndpoints(request.rangeId, request.start, request.end);
    if (!replacement || replacement.kind !== 'ready-to-extract') {
      return Object.freeze({ kind: 'rejected', message: 'The exact range could not be locked.' });
    }
    this.extraction.resetForRevision(request.rangeId);
    this.persistQueue();
    if (request.startThumbnail && (current.start.kind !== 'exact-frame'
      || current.start.identity.frameIndex !== request.start.identity.frameIndex)) {
      this.captureThumbnails.replaceRange(request.rangeId, request.startThumbnail);
    }
    this.selectedRangeId = request.rangeId;
    const message = previousExtraction?.kind === 'completed'
      ? 'Revised range locked. The earlier clip remains saved; extract again to create a new clip.'
      : 'Exact range locked';
    this.status.show(message);
    return Object.freeze({ kind: 'committed', range: replacement, message });
  }

  nextInexactRangeId(afterRangeId: CapturedRangeId): CapturedRangeId | null {
    const ranges = this.rangeModel?.snapshot.ranges ?? [];
    const currentIndex = ranges.findIndex(range => range.id === afterRangeId);
    if (currentIndex < 0) return null;
    return ranges.slice(currentIndex + 1).find(range => range.kind === 'needs-exact-frames')?.id ?? null;
  }

  refinementChanged(session: RefineGifSession): void {
    if (this.activeRefinement !== session) return;
    const current = session.snapshot.stagedRevision;
    if (current !== this.lastRefinementRevision || session.snapshot.status !== 'editing') {
      this.lastRefinementRevision = current;
      this.status.advancePreview();
    }
    this.publish();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.persistQueue();
    this.disposed = true;
    this.savedCaptureQueue?.invalidate();
    this.listeners.clear();
    const review = this.movie.close();
    this.activeRefinement = null;
    await this.extraction.dispose();
    await Promise.allSettled([review?.dispose(), this.captureThumbnails.dispose()]);
  }
  private async replaceSource(
    selected: IFrameReviewSourceSelection,
    candidate: IFrameReviewSession,
  ): Promise<void> {
    this.persistQueue();
    await this.extraction.cancel();
    this.movie.stopFollowingReview();
    this.activeRefinement?.invalidate('The source changed before this refinement was locked.');
    await this.captureThumbnails.clear();
    this.savedCaptureQueue?.invalidate();
    const previous = this.movie.switchTo(selected, candidate);
    this.status.advancePreview();
    this.rangeModel = new RangeCaptureModel(this.movie.sourceGeneration);
    this.savedCaptureQueue = this.options.captureStore
      ? this.createSavedCaptureQueue(this.options.captureStore) : null;
    this.restoringCaptures = !!this.options.captureStore;
    this.capturesLoading = !!this.options.captureStore;
    const phase = this.movie.reviewState?.phase;
    if (phase === 'failed' || phase === 'closed') {
      this.restoringCaptures = false;
      this.capturesLoading = false;
    }
    this.restoreStarted = false;
    this.selectedRangeId = null;
    this.activeRefinement = null;
    this.lastRefinementRevision = null;
    this.extraction.startForMovie(selected.name);
    this.movie.followReview();
    this.publish();
    if (previous) await previous.dispose();
  }
  private async indexedIdentitiesForSavedEndpoints(
    review: IFrameReviewSession,
    savedStart: ISavedExactFrameEndpoint | null,
    savedEnd: ISavedExactFrameEndpoint | null,
  ) {
    const [start, end] = await Promise.all([
      savedStart ? review.frameIdentity(savedStart.frameIndex) : Promise.resolve(undefined),
      savedEnd ? review.frameIdentity(savedEnd.frameIndex) : Promise.resolve(undefined),
    ]);
    return { start, end };
  }

  private endpointFromCapture(capture: IFrameReviewDisplayedCapture | null): CaptureEndpoint | null {
    if (!capture || !this.rangeModel || !this.movie.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.movie.reviewState.sourceGeneration) return null;
    return capture.point.kind === 'exact-frame'
      ? CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.movie.sourceGeneration)
      : CaptureEndpointValue.timestamp(capture.point.timestampUs, this.movie.sourceGeneration);
  }

  private async restoreCaptures(review: IFrameReviewSession): Promise<void> {
    const savedCaptureQueue = this.savedCaptureQueue;
    if (!savedCaptureQueue || this.movie.review !== review || !this.restoringCaptures || this.restoreStarted) return;
    const generation = this.movie.sourceGeneration;
    this.restoreStarted = true;
    try {
      const restored = await savedCaptureQueue.attach(review.id);
      if (!restored || this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation
        || this.savedCaptureQueue !== savedCaptureQueue) return;
      this.rangeModel = restored;
      for (const range of this.rangeModel.snapshot.ranges) this.captureThumbnails.markRestoredMissing(range.id);
      void this.restoreThumbnails(review, generation);
      const continuation = this.rangeModel.continuationEndpoint();
      if (continuation) {
        try {
          await this.options.capturePositioning?.showFrameAfterCapture(review, continuation);
        } catch (error) {
          this.reportError('Saved captures loaded, but the movie could not be positioned after them.', error);
        }
      }
      if (this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
      const savedDraft = this.rangeModel.snapshot.capture;
      const count = this.rangeModel.snapshot.ranges.length;
      this.status.show(count > 0
        ? `Restored ${count} saved ranges${savedDraft.kind === 'draft' && (savedDraft.start || savedDraft.end) ? ' and a draft' : ''}.`
        : savedDraft.kind === 'draft' && (savedDraft.start || savedDraft.end) ? 'Restored saved range draft.' : 'Exact capture ready');
      this.restoringCaptures = false;
      this.capturesLoading = false;
      this.publish();
    } catch (error) {
      if (this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
      const message = 'Saved captures could not be loaded. The stored file was kept for recovery.';
      this.status.show(message);
      this.restoringCaptures = false;
      this.capturesLoading = false;
      this.reportError(message, error);
      this.publish();
    }
  }

  private async restoreThumbnails(review: IFrameReviewSession, generation: number): Promise<void> {
    let failures = 0;
    const draft = this.rangeModel?.snapshot.capture;
    if (draft?.kind === 'draft' && draft.start?.kind === 'saved-exact-frame') {
      try {
        const frame = await review.thumbnailFrame(draft.start.frameIndex);
        const current = this.rangeModel?.snapshot.capture;
        if (this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
        if (current?.kind === 'draft' && current.start === draft.start
          && frame.identity.frameInfoHash === draft.start.frameInfoHash) this.captureThumbnails.replaceDraft(frame);
      } catch {
        failures += 1;
      }
    }
    for (const range of this.rangeModel?.snapshot.ranges ?? []) {
      if (this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
      if (range.start.kind !== 'saved-exact-frame') continue;
      try {
        const frame = await review.thumbnailFrame(range.start.frameIndex);
        if (this.disposed || this.movie.review !== review || this.movie.sourceGeneration !== generation) return;
        if (frame.identity.frameInfoHash === range.start.frameInfoHash) {
          this.captureThumbnails.replaceRange(range.id, frame);
        }
      } catch {
        failures += 1;
      }
    }
    if (failures > 0 && this.movie.review === review && this.movie.sourceGeneration === generation) {
      this.reportError(`${failures} saved start thumbnails could not be recreated. Retry them from Clips.`);
    }
  }

  private persistQueue(): void {
    if (!this.rangeModel) return;
    const completed = new Set(this.rangeModel.snapshot.ranges
      .filter(range => this.extraction.isCompleted(range.id)).map(range => range.id));
    this.savedCaptureQueue?.save(this.rangeModel, completed);
  }

  private extractionMovie(): IExtractionMovie | null {
    const source = this.movie.source;
    return source ? Object.freeze({
      sourceHandle: source.sourceHandle,
      reviewSessionId: this.movie.review?.id,
      sourceGeneration: this.movie.sourceGeneration,
      movieName: source.name,
    }) : null;
  }

  private queuedRangeIds(): readonly CapturedRangeId[] {
    return this.rangeModel?.snapshot.ranges.map(range => range.id) ?? [];
  }

  private captureUnavailable(): RangeCaptureTransition {
    const message = this.savedCaptureQueue?.hasStaleRanges
      ? 'Open movie to find the original source before capturing.'
      : this.movie.lifecycle === 'opening' ? 'Wait for the movie to finish opening.'
        : this.restoringCaptures ? 'Saved captures are still loading.'
        : 'Capture becomes available after exact frame preparation.';
    this.status.show(message);
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private rejectRefinement(message: string): BeginRefinementResult {
    this.status.show(message);
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private createSavedCaptureQueue(store: IClipCapturesStoreService): SavedCaptureQueuePersistence {
    return new SavedCaptureQueuePersistence(store, this.movie.sourceGeneration, error => {
      this.reportError('Captures could not be saved. Current work remains available until the app closes.', error);
    });
  }

  private previewTarget(): IGifPreviewTarget | null {
    if (this.movie.lifecycle !== 'open' || !this.movie.reviewState?.captureEnabled || this.restoringCaptures) return null;
    const refinement = this.activeRefinement?.snapshot;
    if (refinement) {
      if (refinement.status === 'invalidated' || refinement.start.kind !== 'exact-frame'
        || refinement.end.kind !== 'exact-frame') return null;
      return Object.freeze({ kind: 'refinement', rangeId: refinement.rangeId,
        startFrameIndex: refinement.start.identity.frameIndex,
        endFrameIndex: refinement.end.identity.frameIndex,
        sourceGeneration: this.movie.sourceGeneration, revision: this.status.previewRevision });
    }
    const capture = this.rangeModel?.snapshot.capture;
    if (capture?.kind === 'draft') {
      const start = capture.start;
      const end = capture.end;
      if ((start?.kind !== 'exact-frame' && start?.kind !== 'saved-exact-frame')
        || (end?.kind !== 'exact-frame' && end?.kind !== 'saved-exact-frame')) return null;
      return Object.freeze({ kind: 'draft', rangeId: null,
        startFrameIndex: start.kind === 'exact-frame' ? start.identity.frameIndex : start.frameIndex,
        endFrameIndex: end.kind === 'exact-frame' ? end.identity.frameIndex : end.frameIndex,
        sourceGeneration: this.movie.sourceGeneration, revision: this.status.previewRevision });
    }
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === this.selectedRangeId);
    if ((range?.kind !== 'ready-to-extract' && range?.kind !== 'saved-exact-range')
      || this.savedCaptureQueue?.isStale(range.id)) return null;
    return Object.freeze({ kind: 'locked', rangeId: range.id,
      startFrameIndex: range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex,
      endFrameIndex: range.end.kind === 'exact-frame' ? range.end.identity.frameIndex : range.end.frameIndex,
      sourceGeneration: this.movie.sourceGeneration, revision: this.status.previewRevision });
  }

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
