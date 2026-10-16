import type { CapturedRangeId } from '../domain/captured-range.js';
import type { RangeCaptureModel } from '../domain/range-capture-model.js';
import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { IClipCapturesStoreService } from './clip-captures-store-service.js';
import { SavedCaptureQueuePersistence } from './saved-capture-queue-persistence.js';

// Where a movie's capture queue is kept between runs of the app.
export interface ICaptureStorage {
  // True from opening a movie until its saved queue has been restored or the attempt has ended.
  readonly restoring: boolean;
  readonly loading: boolean;
  readonly hasStaleRanges: boolean;
  startForMovie(sourceGeneration: number): void;
  endRestore(): void;
  stopShowingLoading(): void;
  attach(reviewId: FrameReviewSessionId): Promise<RangeCaptureModel | null>;
  save(model: RangeCaptureModel, completedRangeIds: ReadonlySet<string>): void;
  isStale(rangeId: CapturedRangeId): boolean;
  markStale(rangeId: CapturedRangeId): void;
  forgetRange(rangeId: CapturedRangeId): void;
  canRemoveCaptures(movieOpen: boolean): boolean;
  invalidate(): void;
}

// Saves each movie's queue in the desktop capture store and restores it when that movie opens again.
export class SavedCaptureStorage implements ICaptureStorage {
  private queue: SavedCaptureQueuePersistence | null = null;
  private restoringQueue = false;
  private loadingQueue = false;

  constructor(
    private readonly store: IClipCapturesStoreService,
    private readonly reporting: Readonly<{
      reporter?: Pick<ActivityReporter, 'failure'>;
      diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
    }> = {},
  ) {}

  get restoring(): boolean { return this.restoringQueue; }
  get loading(): boolean { return this.loadingQueue; }
  get hasStaleRanges(): boolean { return this.queue?.hasStaleRanges === true; }

  startForMovie(sourceGeneration: number): void {
    this.queue = new SavedCaptureQueuePersistence(this.store, sourceGeneration, error => {
      const message = 'Captures could not be saved. Current work remains available until the app closes.';
      this.reporting.reporter?.failure(message);
      void this.reporting.diagnostics?.logRuntimeError(message, error);
    });
    this.restoringQueue = true;
    this.loadingQueue = true;
  }

  endRestore(): void {
    this.restoringQueue = false;
    this.loadingQueue = false;
  }

  stopShowingLoading(): void { this.loadingQueue = false; }

  async attach(reviewId: FrameReviewSessionId): Promise<RangeCaptureModel | null> {
    const queue = this.queue;
    if (!queue) return null;
    const restored = await queue.attach(reviewId);
    return this.queue === queue ? restored : null;
  }

  save(model: RangeCaptureModel, completedRangeIds: ReadonlySet<string>): void {
    this.queue?.save(model, completedRangeIds);
  }

  isStale(rangeId: CapturedRangeId): boolean { return this.queue?.isStale(rangeId) === true; }
  markStale(rangeId: CapturedRangeId): void { this.queue?.markStale(rangeId); }
  forgetRange(rangeId: CapturedRangeId): void { this.queue?.forgetRange(rangeId); }

  // Saved captures can be removed once the movie's saved queue has loaded.
  canRemoveCaptures(): boolean { return this.queue?.hasMovieReference === true; }

  invalidate(): void { this.queue?.invalidate(); }
}

// Keeps captures only for as long as the movie stays open.
export class UnsavedCaptureStorage implements ICaptureStorage {
  readonly restoring = false;
  readonly loading = false;
  readonly hasStaleRanges = false;

  startForMovie(): void {}
  endRestore(): void {}
  stopShowingLoading(): void {}
  async attach(): Promise<RangeCaptureModel | null> { return null; }
  save(): void {}
  isStale(): boolean { return false; }
  markStale(): void {}
  forgetRange(): void {}
  canRemoveCaptures(movieOpen: boolean): boolean { return movieOpen; }
  invalidate(): void {}
}
