import type { FrameReviewDisplayFrame } from '../frame-review/frame-review-api.js';
import type { CapturedRangeId } from '../domain/captured-range.js';
import type {
  IThumbnailCacheService,
  ThumbnailId,
} from './thumbnail-cache-service.js';

export type GifThumbnailState =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; id: ThumbnailId; url: string }>
  | Readonly<{ kind: 'missing'; message: string }>;

type ThumbnailSlot = {
  readonly frame: FrameReviewDisplayFrame;
  disposed: boolean;
  state: GifThumbnailState;
};

type GifCaptureThumbnailSessionOptions = Readonly<{
  onChanged: () => void;
  onError: (message: string, error?: unknown) => void;
}>;

export class GifCaptureThumbnailSession {
  private readonly rangeThumbnails = new Map<CapturedRangeId, ThumbnailSlot>();
  private draftThumbnail: ThumbnailSlot | null = null;
  private disposed = false;

  constructor(
    private readonly thumbnails: IThumbnailCacheService,
    private readonly options: GifCaptureThumbnailSessionOptions,
  ) {}

  get draftState(): GifThumbnailState {
    return this.draftThumbnail?.state ?? Object.freeze({ kind: 'empty' });
  }

  stateForRange(rangeId: CapturedRangeId): GifThumbnailState {
    return this.rangeThumbnails.get(rangeId)?.state ?? Object.freeze({ kind: 'empty' });
  }

  replaceDraft(frame: FrameReviewDisplayFrame): void {
    if (this.disposed) return;
    if (this.draftThumbnail) void this.disposeThumbnail(this.draftThumbnail);
    const slot = this.createLoadingSlot(frame);
    this.draftThumbnail = slot;
    void this.saveThumbnail(slot);
  }

  commitDraftToRange(rangeId: CapturedRangeId): void {
    if (!this.draftThumbnail || this.disposed) return;
    this.rangeThumbnails.set(rangeId, this.draftThumbnail);
    this.draftThumbnail = null;
  }

  replaceRange(rangeId: CapturedRangeId, frame: FrameReviewDisplayFrame): void {
    if (this.disposed) return;
    const previous = this.rangeThumbnails.get(rangeId) ?? null;
    const replacement = this.createLoadingSlot(frame);
    this.rangeThumbnails.set(rangeId, replacement);
    // Let the owning refinement commit update its snapshot before thumbnail publication.
    void Promise.resolve().then(async () => {
      await this.saveThumbnail(replacement);
      if (previous) await this.disposeThumbnail(previous);
    });
  }

  async retryRange(rangeId: CapturedRangeId): Promise<void> {
    const slot = this.rangeThumbnails.get(rangeId);
    if (!slot || slot.disposed || this.disposed) return;
    await this.saveThumbnail(slot);
  }

  removeRange(rangeId: CapturedRangeId): void {
    const thumbnail = this.rangeThumbnails.get(rangeId);
    this.rangeThumbnails.delete(rangeId);
    if (thumbnail) void this.disposeThumbnail(thumbnail);
  }

  async clear(): Promise<void> {
    const slots = [this.draftThumbnail, ...this.rangeThumbnails.values()].filter(
      (slot): slot is ThumbnailSlot => slot !== null,
    );
    this.draftThumbnail = null;
    this.rangeThumbnails.clear();
    await Promise.allSettled(slots.map(slot => this.disposeThumbnail(slot)));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.clear();
    this.thumbnails.dispose();
  }

  private createLoadingSlot(frame: FrameReviewDisplayFrame): ThumbnailSlot {
    return {
      frame,
      disposed: false,
      state: Object.freeze({ kind: 'loading' }),
    };
  }

  private async saveThumbnail(slot: ThumbnailSlot): Promise<void> {
    if (slot.disposed || this.disposed) return;
    const previous = slot.state.kind === 'ready' ? slot.state.id : null;
    slot.state = Object.freeze({ kind: 'loading' });
    this.options.onChanged();
    try {
      const entry = await this.thumbnails.save(slot.frame);
      if (slot.disposed || this.disposed) {
        await this.deleteThumbnail(entry.id);
        return;
      }
      slot.state = Object.freeze({ kind: 'ready', id: entry.id, url: entry.url });
      if (previous && previous !== entry.id) await this.deleteThumbnail(previous);
      this.options.onChanged();
    } catch (error) {
      if (slot.disposed || this.disposed) return;
      slot.state = Object.freeze({ kind: 'missing', message: 'Thumbnail unavailable' });
      this.options.onError('A captured start thumbnail could not be saved.', error);
      this.options.onChanged();
    }
  }

  private async disposeThumbnail(slot: ThumbnailSlot): Promise<void> {
    if (slot.disposed) return;
    slot.disposed = true;
    if (slot.state.kind === 'ready') await this.deleteThumbnail(slot.state.id);
  }

  private async deleteThumbnail(id: ThumbnailId): Promise<void> {
    try {
      await this.thumbnails.delete(id);
    } catch (error) {
      this.options.onError('An ephemeral thumbnail could not be removed.', error);
    }
  }
}
