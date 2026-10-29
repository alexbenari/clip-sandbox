import type { FrameReviewSessionId, FrameReviewSourceHandle } from '../frame-review/frame-review-api.js';
import type { FolderAccess } from './folder-access.js';

export interface IZoomEditClipRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
}

export interface IZoomEditWindowRequest extends IZoomEditClipRequest {
  readonly widen: number;
  readonly previousWindowId?: string;
}

export type ZoomEditWindowAnswer =
  | Readonly<{ kind: 'ready'; sourceHandle: FrameReviewSourceHandle; windowId: string }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'no-source-info' }>;

export type ZoomEditAnchorAnswer =
  | Readonly<{ kind: 'anchored'; clipStartFrame: number; earliestFrame: number; latestFrame: number }>
  | Readonly<{ kind: 'not-found' }>;

export interface IZoomEditSourceService {
  openClip(request: IZoomEditClipRequest): Promise<FrameReviewSourceHandle>;
  openWindow(request: IZoomEditWindowRequest): Promise<ZoomEditWindowAnswer>;
  anchorWindow(request: Readonly<{ windowId: string; sessionId: FrameReviewSessionId }>): Promise<ZoomEditAnchorAnswer>;
}
