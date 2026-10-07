import type {
  ICollectionClipRefinementRequest,
  ICollectionClipRefinementService,
  CollectionClipSourceResult,
} from '../../app/collection-clip-refinement.js';
import { FrameReviewOpaqueId } from '../../frame-review/frame-review-api.js';

type CollectionRefineApi = {
  inspect(request: ICollectionClipRefinementRequest): Promise<unknown>;
  resolve(request: ICollectionClipRefinementRequest): Promise<unknown>;
};

export class ElectronCollectionClipRefinementService implements ICollectionClipRefinementService {
  private readonly api: CollectionRefineApi;

  constructor(win: Window & { clipSandboxDesktop?: { collectionRefine?: CollectionRefineApi } } = window) {
    const api = win.clipSandboxDesktop?.collectionRefine;
    if (!api || typeof api.inspect !== 'function' || typeof api.resolve !== 'function') {
      throw new Error('Electron collection refinement API is unavailable.');
    }
    this.api = api;
  }

  async inspect(request: ICollectionClipRefinementRequest): Promise<boolean> {
    const result = await this.api.inspect(request);
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || typeof (result as Record<string, unknown>).available !== 'boolean') {
      throw new Error('Collection refinement availability is invalid.');
    }
    return (result as { available: boolean }).available;
  }

  async resolve(request: ICollectionClipRefinementRequest): Promise<CollectionClipSourceResult> {
    const result = await this.api.resolve(request);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Collection refinement source is invalid.');
    }
    const record = result as Record<string, unknown>;
    if (record.kind === 'cancelled') return Object.freeze({ kind: 'cancelled' });
    if (record.kind !== 'resolved') throw new Error('Collection refinement source is invalid.');
    const source = this.record(record.source);
    const range = this.record(record.range);
    const start = this.endpoint(range.start);
    const end = this.endpoint(range.end);
    if (end.frameIndex < start.frameIndex || range.endInclusive !== true) {
      throw new Error('Collection clip frame range is invalid.');
    }
    if (typeof source.name !== 'string' || source.name.length < 1 || source.name.length > 512) {
      throw new Error('Collection source name is invalid.');
    }
    return Object.freeze({ kind: 'resolved',
      source: Object.freeze({ name: source.name, sourceHandle: FrameReviewOpaqueId.sourceHandle(source.sourceHandle) }),
      range: Object.freeze({ start, end }),
    });
  }

  private endpoint(value: unknown): Readonly<{ frameIndex: number; frameInfoHash: string }> {
    const record = this.record(value);
    if (!Number.isSafeInteger(record.frameIndex) || Number(record.frameIndex) < 0
      || typeof record.frameInfoHash !== 'string' || !/^[a-f0-9]{16}$/.test(record.frameInfoHash)) {
      throw new Error('Collection clip endpoint is invalid.');
    }
    return Object.freeze({ frameIndex: Number(record.frameIndex), frameInfoHash: record.frameInfoHash });
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Collection refinement response is invalid.');
    }
    return value as Record<string, unknown>;
  }
}
