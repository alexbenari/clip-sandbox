import type { FrameReviewDisplayFrame } from '../../frame-review/frame-review-api.js';
import {
  type IThumbnailCacheEntry,
  type IThumbnailCacheService,
  ThumbnailOpaqueId,
  type ThumbnailId,
} from '../../app/thumbnail-cache-service.js';

interface IElectronThumbnailCacheApi {
  save(bytes: Uint8Array): Promise<unknown>;
  load(id: string): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

export interface IThumbnailPngEncoder {
  encode(frame: FrameReviewDisplayFrame): Promise<Blob>;
}

type ElectronThumbnailCacheWindow = Window & {
  clipSandboxDesktop?: { thumbnailCache?: IElectronThumbnailCacheApi };
};

type ElectronThumbnailCacheServiceOptions = {
  readonly window?: ElectronThumbnailCacheWindow;
  readonly encoder?: IThumbnailPngEncoder;
};

export class ElectronThumbnailCacheService implements IThumbnailCacheService {
  private static readonly maximumPngBytes = 8 * 1024 * 1024;
  private readonly api: IElectronThumbnailCacheApi;
  private readonly encoder: IThumbnailPngEncoder;
  private readonly urls = new Map<ThumbnailId, string>();

  constructor(options: ElectronThumbnailCacheServiceOptions = {}) {
    const win: ElectronThumbnailCacheWindow = options.window ?? window;
    const api = win.clipSandboxDesktop?.thumbnailCache;
    if (!api || typeof api.save !== 'function' || typeof api.load !== 'function' || typeof api.delete !== 'function') {
      throw new Error('Electron thumbnail-cache API is unavailable.');
    }
    this.api = api;
    this.encoder = options.encoder ?? new CanvasThumbnailPngEncoder(win.document);
  }

  async save(frame: FrameReviewDisplayFrame): Promise<IThumbnailCacheEntry> {
    const png = await this.encoder.encode(frame);
    const bytes = new Uint8Array(await png.arrayBuffer());
    this.assertPngBytes(bytes);
    const response = this.record(await this.api.save(bytes), 'thumbnail save response');
    if (response.ok !== true) throw this.responseError(response, 'Thumbnail could not be saved.');
    return this.entry(this.thumbnailId(response.id), png);
  }

  async load(id: ThumbnailId): Promise<IThumbnailCacheEntry> {
    this.thumbnailId(id);
    const response = this.record(await this.api.load(id), 'thumbnail load response');
    if (response.ok !== true) throw this.responseError(response, 'Thumbnail could not be loaded.');
    const loadedId = this.thumbnailId(response.id);
    if (!(response.bytes instanceof Uint8Array)) throw new Error('Thumbnail bytes are invalid.');
    this.assertPngBytes(response.bytes);
    return this.entry(loadedId, new Blob([Uint8Array.from(response.bytes)], { type: 'image/png' }));
  }

  async delete(id: ThumbnailId): Promise<void> {
    this.thumbnailId(id);
    const response = this.record(await this.api.delete(id), 'thumbnail delete response');
    if (response.ok !== true) throw this.responseError(response, 'Thumbnail could not be deleted.');
    this.revoke(id);
  }

  dispose(): void {
    for (const id of this.urls.keys()) this.revoke(id);
  }

  private entry(id: ThumbnailId, png: Blob): IThumbnailCacheEntry {
    this.revoke(id);
    const url = URL.createObjectURL(png);
    this.urls.set(id, url);
    return Object.freeze({ id, url });
  }

  private revoke(id: ThumbnailId): void {
    const url = this.urls.get(id);
    if (!url) return;
    this.urls.delete(id);
    URL.revokeObjectURL(url);
  }

  private thumbnailId(value: unknown): ThumbnailId {
    return ThumbnailOpaqueId.parse(value);
  }

  private assertPngBytes(bytes: Uint8Array): void {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.byteLength > ElectronThumbnailCacheService.maximumPngBytes) {
      throw new Error('Thumbnail PNG exceeds the byte limit.');
    }
    if (bytes.byteLength < signature.length || !signature.every((byte, index) => bytes[index] === byte)) {
      throw new Error('Thumbnail payload is not a PNG image.');
    }
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
    return value as Record<string, unknown>;
  }

  private responseError(response: Record<string, unknown>, fallback: string): Error {
    const error = response.error;
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message) return new Error(message.slice(0, 500));
    }
    return new Error(fallback);
  }
}

class CanvasThumbnailPngEncoder implements IThumbnailPngEncoder {
  private static readonly maximumWidth = 320;

  constructor(private readonly document: Document) {}

  async encode(frame: FrameReviewDisplayFrame): Promise<Blob> {
    const bytes = new Uint8ClampedArray(await frame.pixels.arrayBuffer());
    if (bytes.byteLength !== frame.width * frame.height * 4) {
      throw new Error('Thumbnail source pixels have an unexpected size.');
    }
    const source = this.document.createElement('canvas');
    source.width = frame.width;
    source.height = frame.height;
    const sourceContext = source.getContext('2d', { alpha: false });
    if (!sourceContext) throw new Error('Thumbnail canvas is unavailable.');
    sourceContext.putImageData(new ImageData(bytes, frame.width, frame.height), 0, 0);

    const scale = Math.min(1, CanvasThumbnailPngEncoder.maximumWidth / frame.width);
    const output = this.document.createElement('canvas');
    output.width = Math.max(1, Math.round(frame.width * scale));
    output.height = Math.max(1, Math.round(frame.height * scale));
    const outputContext = output.getContext('2d', { alpha: false });
    if (!outputContext) throw new Error('Thumbnail canvas is unavailable.');
    outputContext.drawImage(source, 0, 0, output.width, output.height);
    return new Promise<Blob>((resolve, reject) => {
      output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Thumbnail PNG encoding failed.')), 'image/png');
    });
  }
}
