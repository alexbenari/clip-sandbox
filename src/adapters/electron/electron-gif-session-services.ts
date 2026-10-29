import { ElectronClipExtractionService } from './electron-clip-extraction-service.js';
import { ElectronFrameReviewService } from './electron-frame-review-service.js';
import { ElectronThumbnailCacheService } from './electron-thumbnail-cache-service.js';

// The desktop services the GIF Extraction session needs. Saving captures is a separate service.
export class ElectronGifSessionServices {
  static tryCreate(win: Window = window): ElectronGifSessionServices | null {
    const frameReview = ElectronFrameReviewService.tryCreate(win);
    const thumbnails = ElectronThumbnailCacheService.tryCreate(win);
    const extractionService = ElectronClipExtractionService.tryCreate(win);
    if (!frameReview || !thumbnails || !extractionService) return null;
    return new ElectronGifSessionServices(frameReview, thumbnails, extractionService);
  }

  private constructor(
    readonly frameReview: ElectronFrameReviewService,
    readonly thumbnails: ElectronThumbnailCacheService,
    readonly extractionService: ElectronClipExtractionService,
  ) {}
}
