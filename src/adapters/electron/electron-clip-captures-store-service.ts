import type { FrameReviewSessionId } from '../../frame-review/frame-review-api.js';
import { SourceFingerprint } from '../../frame-review/model/source-fingerprint.js';
import type { ISavedRangeCaptureData } from '../../app/saved-capture-codec.js';
import type { AttachedCaptures, IClipCapturesStoreService } from '../../app/clip-captures-store-service.js';

interface IClipCapturesApi {
  attach(request: unknown): Promise<unknown>;
  save(request: unknown): Promise<unknown>;
}

type ClipCapturesWindow = Window & { clipSandboxDesktop?: { clipCaptures?: IClipCapturesApi } };

export class ElectronClipCapturesStoreService implements IClipCapturesStoreService {
  private readonly api: IClipCapturesApi;

  static tryCreate(win: ClipCapturesWindow = window): ElectronClipCapturesStoreService | null {
    return win.clipSandboxDesktop?.clipCaptures ? new ElectronClipCapturesStoreService(win) : null;
  }

  constructor(win: ClipCapturesWindow = window) {
    const api = win.clipSandboxDesktop?.clipCaptures;
    if (!api || typeof api.attach !== 'function' || typeof api.save !== 'function') {
      throw new Error('Saved-captures API is unavailable.');
    }
    this.api = api;
  }

  async attach(sessionId: FrameReviewSessionId): Promise<AttachedCaptures> {
    const record = this.record(this.result(await this.api.attach({ sessionId })));
    return Object.freeze({
      movieRef: this.movieRef(record.movieRef),
      fingerprint: SourceFingerprint.parse(record.fingerprint),
      data: this.record(record.data) as unknown as ISavedRangeCaptureData,
    });
  }

  async save(movieRef: string, data: ISavedRangeCaptureData): Promise<void> {
    this.result(await this.api.save({ movieRef: this.movieRef(movieRef), data }));
  }

  private movieRef(value: unknown): string {
    if (typeof value !== 'string' || !/^capture_[a-zA-Z0-9_-]{8,120}$/.test(value)) {
      throw new Error('Saved movie reference is invalid.');
    }
    return value;
  }

  private result(value: unknown): unknown {
    const envelope = this.record(value);
    if (envelope.ok !== true) {
      const error = envelope.error && typeof envelope.error === 'object' ? envelope.error as Record<string, unknown> : {};
      throw new Error(typeof error.message === 'string' ? error.message : 'Saved captures are unavailable.');
    }
    return envelope.result;
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved-captures response is invalid.');
    return value as Record<string, unknown>;
  }
}
