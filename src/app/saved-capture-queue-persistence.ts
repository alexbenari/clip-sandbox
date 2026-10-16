import type { CapturedRangeId } from '../domain/captured-range.js';
import { RangeCaptureModel, type ISavedRangeCaptureData } from '../domain/range-capture-model.js';
import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { IClipCapturesStoreService } from './clip-captures-store-service.js';

export class SavedCaptureQueuePersistence {
  private movieRef: string | null = null;
  private lastSavedSnapshot: string | null = null;
  private readonly staleRangeIds = new Set<CapturedRangeId>();
  private active = true;

  constructor(
    private readonly store: IClipCapturesStoreService,
    private readonly sourceGeneration: number,
    private readonly onSaveError: (error: unknown) => void,
  ) {}

  get hasMovieReference(): boolean { return this.movieRef !== null; }
  get hasStaleRanges(): boolean { return this.staleRangeIds.size > 0; }

  isStale(rangeId: CapturedRangeId): boolean { return this.staleRangeIds.has(rangeId); }
  markStale(rangeId: CapturedRangeId): void { this.staleRangeIds.add(rangeId); }
  forgetRange(rangeId: CapturedRangeId): void { this.staleRangeIds.delete(rangeId); }

  // Returns null when the source was replaced while the store answered.
  async attach(sessionId: FrameReviewSessionId): Promise<RangeCaptureModel | null> {
    const attached = await this.store.attach(sessionId);
    if (!this.active) return null;
    return this.adopt(attached.movieRef, attached.data);
  }

  save(model: RangeCaptureModel | null, completedRangeIds: ReadonlySet<string>): void {
    if (!this.active || !this.movieRef || !model) return;
    const data = model.toSavedData(completedRangeIds);
    const serialized = JSON.stringify(data);
    if (serialized === this.lastSavedSnapshot) return;
    this.lastSavedSnapshot = serialized;
    void this.store.save(this.movieRef, data).catch(error => {
      this.lastSavedSnapshot = null;
      this.onSaveError(error);
    });
  }

  invalidate(): void { this.active = false; }

  private adopt(movieRef: string, data: ISavedRangeCaptureData): RangeCaptureModel {
    const model = RangeCaptureModel.fromSavedData(data, this.sourceGeneration);
    this.movieRef = movieRef;
    this.lastSavedSnapshot = JSON.stringify(data);
    this.staleRangeIds.clear();
    return model;
  }
}
