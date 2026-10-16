import type { IFrameReviewService, IFrameReviewSession, IFrameReviewSourceSelection } from '../frame-review/frame-review-api.js';
import { SourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
import { CaptureEndpoints } from '../domain/capture-endpoint.js';
import { RangeCaptureModel } from '../domain/range-capture-model.js';
import { UnsavedCaptureStorage } from './capture-storage.js';
import { MovieRangeSession, type MovieRangeSessionOptions } from './movie-range-session.js';
import type { BeginRefinementResult } from './range-refinement.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';

// The source range of a saved collection clip, as frame numbers and hashes from its provenance.
export type CollectionClipRange = Readonly<{
  start: Readonly<{ frameIndex: number; frameInfoHash: string }>;
  end: Readonly<{ frameIndex: number; frameInfoHash: string }>;
}>;

// Collection Refine: opens the original movie of a collection clip, imports that clip's range and
// refines it. Nothing here is saved as a capture.
export class CollectionClipRefinementSession extends MovieRangeSession {
  constructor(frameReview: IFrameReviewService, thumbnails: IThumbnailCacheService, options: MovieRangeSessionOptions = {}) {
    super(frameReview, thumbnails, new UnsavedCaptureStorage(), options);
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

  // Waits for exact frames, checks that the movie still has the clip's frames, then starts refining it.
  async importCollectionRange(range: CollectionClipRange): Promise<BeginRefinementResult> {
    const review = this.movie.review;
    const generation = this.movie.sourceGeneration;
    if (!review) return this.rejectRefinement('Collection refinement is unavailable.');
    await this.exactFramesReady(review);
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
    const model = RangeCaptureModel.withExactRange(
      CaptureEndpoints.exact(start, SourceFrameIdentity.timeUs(start), generation),
      CaptureEndpoints.exact(end, SourceFrameIdentity.timeUs(end), generation),
      generation);
    this.queue.useModel(model);
    return this.refinement.beginRefinement(model.snapshot.ranges[0]!.id);
  }

  private exactFramesReady(review: IFrameReviewSession): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
  }
}
