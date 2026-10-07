import type { IFrameReviewSourceSelection } from '../frame-review/frame-review-api.js';

export interface ICollectionClipRefinementRequest {
  readonly folderPath: string;
  readonly filename: string;
}

export interface ICollectionClipFrameRange {
  readonly start: Readonly<{ frameIndex: number; frameInfoHash: string }>;
  readonly end: Readonly<{ frameIndex: number; frameInfoHash: string }>;
}

export type CollectionClipSourceResult =
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'resolved'; source: IFrameReviewSourceSelection; range: ICollectionClipFrameRange }>;

export interface ICollectionClipRefinementService {
  inspect(request: ICollectionClipRefinementRequest): Promise<boolean>;
  resolve(request: ICollectionClipRefinementRequest): Promise<CollectionClipSourceResult>;
}
