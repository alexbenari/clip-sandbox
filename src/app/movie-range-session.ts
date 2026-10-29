import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import { CaptureEndpoints } from '../domain/capture-endpoint.js';
import type { CapturedRange, CapturedRangeId, IReadyToExtractRange } from '../domain/captured-range.js';
import type { IRangeCaptureSnapshot } from '../domain/range-capture-model.js';
import type { IClipExtractionService } from '../business-logic/clip-extraction-service.js';
import type { ActivityInput } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import { CaptureQueue, type ICapturePositioning } from './capture-queue.js';
import type { CaptureRejectionText } from './capture-rejection-text.js';
import type { ICaptureStorage } from './capture-storage.js';
import type { ClipExtractionEntryState, IExtractionBatchProgress } from './clip-extraction-workflow.js';
import { CurrentMovie } from './current-movie.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { GifThumbnailState } from './capture-thumbnails.js';
import { GifSessionStatus } from './gif-session-status.js';
import { RangeExtraction, type IExtractionMovie, type IExtractionPublicationListener } from './range-extraction.js';
import { RangeRefinement, type BeginRefinementResult } from './range-refinement.js';
import type { IRangeRefinementDraftSnapshot, RangeRefinementDraft } from './range-refinement-draft.js';
import { RuntimeFailureReporter } from './runtime-failure-reporter.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';

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
  readonly refinement: IRangeRefinementDraftSnapshot | null;
  readonly extractionAvailable?: boolean;
  readonly extractionBatch?: IExtractionBatchProgress | null;
  readonly captureAvailable?: boolean;
  readonly capturesLoading: boolean;
  readonly message: string | null;
  readonly previewTarget: IGifPreviewTarget | null;
  readonly previewRevision: number;
}

export type MovieRangeSessionOptions = {
  readonly previewBounds?: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly reporter?: Pick<ActivityReporter, 'progress' | 'success' | 'failure'>;
  readonly activityLog?: { log(entry: ActivityInput): unknown };
  readonly diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
  readonly capturePositioning?: ICapturePositioning;
  readonly rejectionText?: CaptureRejectionText;
  readonly extractionService?: IClipExtractionService;
  readonly publications?: IExtractionPublicationListener;
};

export interface IMovieRangeSessionEvents {
  clipsPublished: void;
}

// One opened movie, its ranges, their refinement and extraction, and the snapshot both GIF screens and
// the Clips panel read. The subclass adds the way a movie and its ranges arrive.
export abstract class MovieRangeSession implements IEventSource<IMovieRangeSessionEvents> {
  private readonly events = new EventSource<IMovieRangeSessionEvents>();
  private readonly listeners = new Set<(snapshot: IGifExtractionSessionSnapshot) => void>();
  protected readonly status = new GifSessionStatus();
  protected readonly movie: CurrentMovie;
  protected readonly extraction: RangeExtraction;
  protected readonly queue: CaptureQueue;
  protected readonly refinement: RangeRefinement;
  protected disposed = false;

  protected constructor(
    frameReview: IFrameReviewService,
    thumbnails: IThumbnailCacheService,
    storage: ICaptureStorage,
    options: MovieRangeSessionOptions,
  ) {
    const { reporter, diagnostics } = options;
    const failures = new RuntimeFailureReporter(reporter, diagnostics);
    this.movie = new CurrentMovie({
      frameReview,
      previewBounds: options.previewBounds ?? Object.freeze({ maxWidth: 1280, maxHeight: 720 }),
      muted: false,
      status: this.status, reporter, failures,
    });
    this.extraction = new RangeExtraction({
      extractionService: options.extractionService,
      publications: options.publications,
      status: this.status, reporter, activityLog: options.activityLog, failures,
    });
    this.queue = new CaptureQueue({
      movie: this.movie, status: this.status, thumbnails, storage, extraction: this.extraction,
      capturePositioning: options.capturePositioning, rejectionText: options.rejectionText, failures,
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
    this.extraction.on('clipsPublished', () => this.events.emit('clipsPublished'));
  }

  get reviewSession(): IFrameReviewSession | null { return this.movie.review; }
  get refinementDraft(): RangeRefinementDraft | null { return this.refinement.active; }

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

  on<TName extends keyof IMovieRangeSessionEvents>(name: TName, handler: EventHandler<IMovieRangeSessionEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  retryThumbnail(rangeId: CapturedRangeId): Promise<void> { return this.queue.retryThumbnail(rangeId); }
  selectRange(rangeId: CapturedRangeId): void { this.queue.selectRange(rangeId); }
  removeRange(rangeId: CapturedRangeId): boolean { return this.queue.removeRange(rangeId); }
  canRemoveRange(rangeId: CapturedRangeId): boolean { return this.queue.canRemoveRange(rangeId); }
  removeDraft(): boolean { return this.queue.removeDraft(); }
  canRemoveDraft(): boolean { return this.queue.canRemoveDraft(); }

  canExtractRange(rangeId: CapturedRangeId): boolean {
    const range = this.queue.range(rangeId);
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
  protected async replaceSource(selected: IFrameReviewSourceSelection, candidate: IFrameReviewSession): Promise<void> {
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

  protected publish(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
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
      if (!CaptureEndpoints.isFrame(start) || !CaptureEndpoints.isFrame(end)) return null;
      return Object.freeze({ kind: 'draft', rangeId: null,
        startFrameIndex: CaptureEndpoints.frameIndexOf(start),
        endFrameIndex: CaptureEndpoints.frameIndexOf(end), sourceGeneration, revision });
    }
    const selected = this.queue.selectedRangeId;
    const range = selected ? this.queue.range(selected) : undefined;
    if ((range?.kind !== 'ready-to-extract' && range?.kind !== 'saved-exact-range') || this.queue.isStale(range.id)) return null;
    return Object.freeze({ kind: 'locked', rangeId: range.id,
      startFrameIndex: CaptureEndpoints.frameIndexOf(range.start),
      endFrameIndex: CaptureEndpoints.frameIndexOf(range.end),
      sourceGeneration, revision });
  }
}
