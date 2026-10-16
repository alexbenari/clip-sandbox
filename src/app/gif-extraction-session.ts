import type { IFrameReviewService } from '../frame-review/frame-review-api.js';
import type { CaptureTransition } from './capture-queue.js';
import { UnsavedCaptureStorage, type ICaptureStorage } from './capture-storage.js';
import type { IFrameReviewDisplayedCapture } from './frame-review-displayed-capture.js';
import { MovieRangeSession, type MovieRangeSessionOptions } from './movie-range-session.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';

export type { IThumbnailCacheService } from './thumbnail-cache-service.js';
export type { GifThumbnailState } from './gif-capture-thumbnail-session.js';
export type { IExtractionPublicationListener } from './range-extraction.js';
export type { ICapturePositioning } from './capture-queue.js';
export type { BeginRefinementResult } from './range-refinement.js';
export type { GifRangeView, IGifExtractionSessionSnapshot, IGifPreviewTarget } from './movie-range-session.js';

export type OpenMovieResult = 'opened' | 'cancelled' | 'failed' | 'busy';

type GifExtractionSessionOptions = MovieRangeSessionOptions & {
  readonly captureStorage?: ICaptureStorage;
};

// GIF Extraction: the user opens a movie and captures ranges from it. The ranges are saved when the
// composition root gives the session saved capture storage.
export class GifExtractionSession extends MovieRangeSession {
  constructor(frameReview: IFrameReviewService, thumbnails: IThumbnailCacheService, options: GifExtractionSessionOptions = {}) {
    super(frameReview, thumbnails, options.captureStorage ?? new UnsavedCaptureStorage(), options);
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

  markStart(capture: IFrameReviewDisplayedCapture | null): CaptureTransition { return this.queue.markStart(capture); }
  markEnd(capture: IFrameReviewDisplayedCapture | null): CaptureTransition { return this.queue.markEnd(capture); }
  lockRange(): Promise<CaptureTransition> { return this.queue.lockRange(); }
}
