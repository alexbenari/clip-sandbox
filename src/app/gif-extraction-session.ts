import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
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
import type { IRefineGifSessionSnapshot, RefineGifSession } from './refine-gif-session.js';
import type { ClipExtractionEntryState, IExtractionBatchProgress } from './clip-extraction-workflow.js';
import type { ActivityInput } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { ExtractionDestination } from './extraction-destination-session.js';
import type { GifThumbnailState } from './gif-capture-thumbnail-session.js';
import { SourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
import { CaptureQueue, type ICapturePositioning } from './capture-queue.js';
import { UnsavedCaptureStorage, type ICaptureStorage } from './capture-storage.js';
import { CurrentMovie } from './current-movie.js';
import { GifSessionStatus } from './gif-session-status.js';
import { RangeExtraction, type IExtractionMovie, type IExtractionPublicationListener } from './range-extraction.js';
import { RangeRefinement, type BeginRefinementResult } from './range-refinement.js';

export type { IThumbnailCacheService } from './thumbnail-cache-service.js';
export type { GifThumbnailState } from './gif-capture-thumbnail-session.js';
export type { IExtractionPublicationListener } from './range-extraction.js';
export type { ICapturePositioning } from './capture-queue.js';

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
export type { BeginRefinementResult } from './range-refinement.js';

type GifExtractionSessionOptions = {
  readonly previewBounds?: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly reporter?: Pick<ActivityReporter, 'progress' | 'success' | 'failure'>;
  readonly activityLog?: { log(entry: ActivityInput): unknown };
  readonly diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
  readonly capturePositioning?: ICapturePositioning;
  readonly extractionService?: IClipExtractionService;
  readonly captureStorage?: ICaptureStorage;
  readonly publications?: IExtractionPublicationListener;
  readonly destination?: ExtractionDestination;
};

type CollectionRefinementOptions = Omit<GifExtractionSessionOptions, 'captureStorage'>;

type GifExtractionSessionMode = 'movie-capture' | 'collection-refinement';

export class GifExtractionSession {
  private readonly listeners = new Set<(snapshot: IGifExtractionSessionSnapshot) => void>();
  private readonly status = new GifSessionStatus();
  private readonly movie: CurrentMovie;
  private readonly extraction: RangeExtraction;
  private readonly queue: CaptureQueue;
  private readonly refinement: RangeRefinement;
  private disposed = false;

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
    options: GifExtractionSessionOptions,
  ) {
    const { reporter, diagnostics } = options;
    this.movie = new CurrentMovie({
      frameReview,
      previewBounds: options.previewBounds ?? Object.freeze({ maxWidth: 1280, maxHeight: 720 }),
      status: this.status, reporter, diagnostics,
    });
    this.extraction = new RangeExtraction({
      extractionService: options.extractionService,
      destination: options.destination,
      publications: options.publications,
      status: this.status, reporter, activityLog: options.activityLog, diagnostics,
    });
    this.queue = new CaptureQueue({
      movie: this.movie,
      status: this.status,
      thumbnails,
      storage: options.captureStorage ?? new UnsavedCaptureStorage(),
      extraction: this.extraction,
      capturePositioning: options.capturePositioning,
      reporter, diagnostics,
    });
    this.refinement = new RangeRefinement({ queue: this.queue, extraction: this.extraction, movie: this.movie, status: this.status });
    this.status.on('changed', () => this.publish());
    this.extraction.on('extractionStateChanged', () => this.queue.save());
    this.movie.on('reviewEnded', () => this.queue.endRestore());
    this.movie.on('exactCaptureReady', () => {
      const review = this.movie.review;
      if (review) void this.queue.restore(review);
    });
    this.queue.on('rangeRemoved', rangeId => this.refinement.endForRemovedRange(rangeId));
  }

  get reviewSession(): IFrameReviewSession | null { return this.movie.review; }
  get refinementSession(): RefineGifSession | null { return this.refinement.active; }

  setExtractionDestination(destination: ExtractionDestination): void {
    this.extraction.setDestination(destination);
  }

  get snapshot(): IGifExtractionSessionSnapshot {
    const { queue } = this;
    const ranges = queue.ranges.map(range => Object.freeze({
      ...range,
      thumbnail: queue.thumbnailFor(range.id),
      extraction: this.extraction.state(range.id),
      validation: queue.isStale(range.id) ? 'stale' as const : undefined,
    }));
    return Object.freeze({
      lifecycle: this.movie.lifecycle,
      source: this.movie.source,
      reviewState: this.movie.reviewState,
      capture: queue.capture,
      draftThumbnail: queue.draftThumbnail,
      ranges: Object.freeze(ranges),
      selectedRangeId: queue.selectedRangeId,
      refinement: this.refinement.active?.snapshot ?? null,
      extractionAvailable: this.extraction.available,
      extractionBatch: this.extraction.batchProgress,
      captureAvailable: this.movie.lifecycle === 'open' && this.movie.reviewState?.captureEnabled === true
        && !queue.restoring && !queue.loading,
      capturesLoading: queue.loading,
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
      this.queue.stopShowingLoading();
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
    this.queue.useModel(model);
    return this.refinement.beginRefinement(rangeId);
  }

  markStart(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition { return this.queue.markStart(capture); }
  markEnd(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition { return this.queue.markEnd(capture); }
  lockRange(): Promise<RangeCaptureTransition> { return this.queue.lockRange(); }
  retryThumbnail(rangeId: CapturedRangeId): Promise<void> { return this.queue.retryThumbnail(rangeId); }
  selectRange(rangeId: CapturedRangeId): void { this.queue.selectRange(rangeId); }
  removeRange(rangeId: CapturedRangeId): boolean { return this.queue.removeRange(rangeId); }
  canRemoveRange(rangeId: CapturedRangeId): boolean { return this.queue.canRemoveRange(rangeId); }
  removeDraft(): boolean { return this.queue.removeDraft(); }
  canRemoveDraft(): boolean { return this.queue.canRemoveDraft(); }

  canExtractRange(rangeId: CapturedRangeId): boolean {
    const range = this.queue.range(rangeId);
    if (this.extraction.destination && this.refinement.blocksExtraction(rangeId)) return false;
    if (!range || this.movie.lifecycle !== 'open' || this.queue.isStale(rangeId)
      || (range.kind !== 'ready-to-extract' && range.kind !== 'saved-exact-range')) return false;
    return this.extraction.canStart(rangeId);
  }

  async extractRange(rangeId: CapturedRangeId): Promise<void> {
    let range = this.queue.range(rangeId);
    if (!range || !this.canExtractRange(rangeId)) return;
    if (range.kind === 'saved-exact-range') {
      if (!await this.queue.prepareSavedRange(rangeId)) return;
      range = this.queue.range(rangeId);
    }
    const movie = this.extractionMovie();
    if (!range || range.kind !== 'ready-to-extract' || !movie) return;
    await this.extraction.extractOne(movie, range, () => this.queuedRangeIds());
  }

  async extractAll(): Promise<void> {
    for (const range of this.queue.ranges) {
      if (range.kind === 'saved-exact-range' && this.canExtractRange(range.id)) await this.queue.prepareSavedRange(range.id);
    }
    const ranges = this.queue.ranges.filter(
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

  beginRefinement(rangeId: CapturedRangeId): Promise<BeginRefinementResult> {
    return this.refinement.beginRefinement(rangeId);
  }

  abandonRefinement(): CapturedRangeId | null {
    return this.refinement.abandon();
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.queue.stopSaving();
    this.disposed = true;
    this.listeners.clear();
    const review = this.movie.close();
    this.refinement.reset();
    await this.extraction.dispose();
    await Promise.allSettled([review?.dispose(), this.queue.dispose()]);
  }

  // The steps keep today's order: save and cancel first, switch only once the replacement has opened.
  private async replaceSource(selected: IFrameReviewSourceSelection, candidate: IFrameReviewSession): Promise<void> {
    this.queue.save();
    await this.extraction.cancel();
    this.movie.stopFollowingReview();
    this.refinement.invalidateForNewMovie();
    await this.queue.clearForReplacement();
    const previous = this.movie.switchTo(selected, candidate);
    this.status.advancePreview();
    this.queue.startForMovie();
    this.refinement.reset();
    this.extraction.startForMovie(selected.name);
    this.movie.followReview();
    this.publish();
    if (previous) await previous.dispose();
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
    return this.queue.ranges.map(range => range.id);
  }

  private rejectRefinement(message: string): BeginRefinementResult {
    this.status.show(message);
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private previewTarget(): IGifPreviewTarget | null {
    if (this.movie.lifecycle !== 'open' || !this.movie.reviewState?.captureEnabled || this.queue.restoring) return null;
    const revision = this.status.previewRevision;
    const sourceGeneration = this.movie.sourceGeneration;
    const refinement = this.refinement.active?.snapshot;
    if (refinement) {
      if (refinement.status === 'invalidated' || refinement.start.kind !== 'exact-frame'
        || refinement.end.kind !== 'exact-frame') return null;
      return Object.freeze({ kind: 'refinement', rangeId: refinement.rangeId,
        startFrameIndex: refinement.start.identity.frameIndex,
        endFrameIndex: refinement.end.identity.frameIndex, sourceGeneration, revision });
    }
    const capture = this.queue.capture?.capture;
    if (capture?.kind === 'draft') {
      const start = capture.start;
      const end = capture.end;
      if ((start?.kind !== 'exact-frame' && start?.kind !== 'saved-exact-frame')
        || (end?.kind !== 'exact-frame' && end?.kind !== 'saved-exact-frame')) return null;
      return Object.freeze({ kind: 'draft', rangeId: null,
        startFrameIndex: start.kind === 'exact-frame' ? start.identity.frameIndex : start.frameIndex,
        endFrameIndex: end.kind === 'exact-frame' ? end.identity.frameIndex : end.frameIndex, sourceGeneration, revision });
    }
    const selected = this.queue.selectedRangeId;
    const range = selected ? this.queue.range(selected) : undefined;
    if ((range?.kind !== 'ready-to-extract' && range?.kind !== 'saved-exact-range') || this.queue.isStale(range.id)) return null;
    return Object.freeze({ kind: 'locked', rangeId: range.id,
      startFrameIndex: range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex,
      endFrameIndex: range.end.kind === 'exact-frame' ? range.end.identity.frameIndex : range.end.frameIndex,
      sourceGeneration, revision });
  }

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
