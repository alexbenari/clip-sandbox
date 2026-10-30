import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { FolderAccess } from './folder-access.js';
import type { EditedClipSource } from './edited-clip-save-service.js';

// A preview shows the staged range with Loopify.
export interface IZoomEditPreviewRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly source: EditedClipSource;
  readonly sessionId: FrameReviewSessionId;
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface IZoomEditPreviewProgress {
  readonly renderedFrames: number;
  readonly totalFrames: number;
}

export interface IZoomEditPreviewService {
  // Each preview replaces the previous one, whose file is then gone.
  render(request: IZoomEditPreviewRequest, onProgress?: (progress: IZoomEditPreviewProgress) => void): Promise<string>;
  release(): Promise<void>;
}
