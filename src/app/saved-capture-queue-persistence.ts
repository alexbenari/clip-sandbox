import type { CapturedRangeId } from '../domain/captured-range.js';
import { RangeCaptureModel, type ISavedRangeCaptureData } from '../domain/range-capture-model.js';
import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { ISourceFingerprint } from '../frame-review/model/source-fingerprint.js';
import type { IClipCapturesStoreService } from './clip-captures-store-service.js';

type RestoredQueue =
  | Readonly<{ kind: 'attached'; model: RangeCaptureModel }>
  | Readonly<{ kind: 'stale'; model: RangeCaptureModel | null }>;

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

  adoptUnavailable(movieRef: string, data: ISavedRangeCaptureData): RangeCaptureModel {
    const model = this.adopt(movieRef, data);
    this.markAllStale(model);
    return model;
  }

  async attach(sessionId: FrameReviewSessionId, expectedFingerprint?: ISourceFingerprint): Promise<RestoredQueue | null> {
    const attached = await this.store.attach(sessionId, expectedFingerprint);
    if (!this.active) return null;
    if (attached.kind === 'stale') {
      const model = attached.data ? this.adopt(attached.movieRef, attached.data) : null;
      if (model) this.markAllStale(model);
      return { kind: 'stale', model };
    }
    return { kind: 'attached', model: this.adopt(attached.movieRef, attached.data) };
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

  private adopt(movieRef: string | null, data: ISavedRangeCaptureData): RangeCaptureModel {
    const model = RangeCaptureModel.fromSavedData(data, this.sourceGeneration);
    this.movieRef = movieRef;
    this.lastSavedSnapshot = JSON.stringify(data);
    this.staleRangeIds.clear();
    return model;
  }

  private markAllStale(model: RangeCaptureModel): void {
    for (const range of model.snapshot.ranges) this.staleRangeIds.add(range.id);
  }
}
