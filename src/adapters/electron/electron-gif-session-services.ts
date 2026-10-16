import { ElectronClipExtractionService } from './electron-clip-extraction-service.js';
import { ElectronFrameReviewService } from './electron-frame-review-service.js';
import { ElectronThumbnailCacheService } from './electron-thumbnail-cache-service.js';

// The desktop services one GIF session (GIF Extraction or Collection Refine) needs. Each session gets its
// own set because the services keep per-session state, such as the extraction in progress. Saving
// captures is separate: only GIF Extraction keeps them.
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
