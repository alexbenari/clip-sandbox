import type { FrameReviewDisplayFrame } from '../frame-review/frame-review-api.js';

declare const thumbnailIdBrand: unique symbol;

export type ThumbnailId = string & { readonly [thumbnailIdBrand]: true };

export interface IThumbnailCacheEntry {
  readonly id: ThumbnailId;
  readonly url: string;
}

export interface IThumbnailCacheService {
  save(frame: FrameReviewDisplayFrame): Promise<IThumbnailCacheEntry>;
  load(id: ThumbnailId): Promise<IThumbnailCacheEntry>;
  delete(id: ThumbnailId): Promise<void>;
  dispose(): void;
}

export class ThumbnailOpaqueId {
  static parse(value: unknown): ThumbnailId {
    if (typeof value !== 'string' || !/^thumbnail_[a-zA-Z0-9_-]{8,120}$/.test(value)) {
      throw new Error('Thumbnail id is invalid.');
    }
    return value as ThumbnailId;
  }
}
