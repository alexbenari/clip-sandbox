import { ElectronClipCapturesStoreService } from './electron-clip-captures-store-service.js';
import { ElectronClipExtractionService } from './electron-clip-extraction-service.js';
import { ElectronFrameReviewService } from './electron-frame-review-service.js';
import { ElectronThumbnailCacheService } from './electron-thumbnail-cache-service.js';

// The desktop services one movie-review session needs. Each session gets its own set because the
// services keep per-session state, such as the extraction in progress.
export class ElectronGifSessionServices {
  static tryCreate(win: Window = window): ElectronGifSessionServices | null {
    const frameReview = ElectronFrameReviewService.tryCreate(win);
    const thumbnails = ElectronThumbnailCacheService.tryCreate(win);
    const extractionService = ElectronClipExtractionService.tryCreate(win);
    const captureStore = ElectronClipCapturesStoreService.tryCreate(win);
    if (!frameReview || !thumbnails || !extractionService || !captureStore) return null;
    return new ElectronGifSessionServices(frameReview, thumbnails, extractionService, captureStore);
  }

  private constructor(
    readonly frameReview: ElectronFrameReviewService,
    readonly thumbnails: ElectronThumbnailCacheService,
    readonly extractionService: ElectronClipExtractionService,
    readonly captureStore: ElectronClipCapturesStoreService,
  ) {}
}
