import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExactClipExtractionRequest,
  IExtractionDestinationEntry,
  IExtractionDestinationSnapshot,
} from '../../frame-review/clip-extraction-api.js';

interface IWireResponse {
  readonly ok?: boolean;
  readonly operationId?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface IElectronClipExtractionApi {
  openDestination(): Promise<IWireResponse>;
  extract(request: unknown): Promise<IWireResponse>;
  saveCollection(request: unknown): Promise<IWireResponse>;
  cancel(extractionOperationId: string): Promise<IWireResponse>;
}

type ClipExtractionWindow = Window & {
  clipSandboxDesktop?: { clipExtraction?: IElectronClipExtractionApi };
};

export class ElectronClipExtractionService implements IClipExtractionService {
  private readonly api: IElectronClipExtractionApi;
  private operationSequence = 0;
  private currentOperationId: string | null = null;

  constructor(win: ClipExtractionWindow = window) {
    const api = win.clipSandboxDesktop?.clipExtraction;
    if (!api || typeof api.openDestination !== 'function' || typeof api.extract !== 'function'
      || typeof api.saveCollection !== 'function' || typeof api.cancel !== 'function') {
      throw new Error('Electron clip-extraction API is unavailable.');
    }
    this.api = api;
  }

  async openExtractionDestination(): Promise<IExtractionDestinationSnapshot> {
    const result = this.record(this.response(await this.api.openDestination()), 'extraction destination');
    const destinationHandle = this.opaqueId(result.destinationHandle, 'destination');
    const folderPath = this.absolutePath(result.folderPath);
    if (!Array.isArray(result.entries)) throw new Error('The extraction destination entries are invalid.');
    const entries = result.entries.map(value => this.destinationEntry(value));
    return Object.freeze({ destinationHandle, folderPath, entries: Object.freeze(entries) });
  }

  async extract(request: IExactClipExtractionRequest): Promise<ICreatedExtractionMedia> {
    const operationId = this.nextOperationId();
    this.currentOperationId = operationId;
    try {
      const result = this.record(this.response(await this.api.extract({ operationId, ...request })), 'created media');
      const entry = this.record(result.entry, 'created media entry');
      const filename = this.filename(result.filename);
      if (entry.name !== filename) throw new Error('The created media entry does not match its filename.');
      return Object.freeze({
        kind: 'created-media',
        mediaHandle: this.opaqueId(result.mediaHandle, 'media'),
        filename,
        type: typeof entry.type === 'string' ? entry.type : 'video/mp4',
        size: this.nonnegativeNumber(entry.size, 'created media size'),
        lastModifiedMs: this.nonnegativeNumber(entry.lastModifiedMs, 'created media modification time'),
      });
    } finally {
      if (this.currentOperationId === operationId) this.currentOperationId = null;
    }
  }

  async saveCollection(destinationHandle: string, filename: string, text: string): Promise<void> {
    this.response(await this.api.saveCollection({ destinationHandle, filename, text }));
  }

  async cancelCurrent(): Promise<void> {
    const operationId = this.currentOperationId;
    if (!operationId) return;
    this.response(await this.api.cancel(operationId));
  }

  private nextOperationId(): string {
    this.operationSequence += 1;
    return `extract_${Date.now()}_${this.operationSequence}`;
  }

  private response(response: IWireResponse): unknown {
    if (response?.ok === true) return response.result;
    const error = this.record(response?.error, 'clip-extraction error');
    const failure = new Error(typeof error.message === 'string' ? error.message : 'Clip extraction failed.');
    Object.defineProperty(failure, 'code', { value: typeof error.code === 'string' ? error.code : 'extraction-failed' });
    throw failure;
  }

  private destinationEntry(value: unknown): IExtractionDestinationEntry {
    const entry = this.record(value, 'extraction destination entry');
    const filename = this.filename(entry.name);
    const type = typeof entry.type === 'string' ? entry.type : '';
    if (type === 'text/plain') {
      if (typeof entry.text !== 'string') throw new Error('The collection content is invalid.');
      return Object.freeze({ kind: 'collection', filename, content: entry.text });
    }
    if (type !== 'video/mp4') throw new Error('The extraction destination entry type is invalid.');
    return Object.freeze({
      kind: 'video',
      filename,
      type,
      size: this.nonnegativeNumber(entry.size, 'destination entry size'),
      lastModifiedMs: this.nonnegativeNumber(entry.lastModifiedMs, 'destination entry modification time'),
    });
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The ${label} is invalid.`);
    return value as Record<string, unknown>;
  }

  private opaqueId(value: unknown, prefix: string): string {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9_-]{8,120}$`).test(value)) {
      throw new Error(`The ${prefix} handle is invalid.`);
    }
    return value;
  }

  private filename(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 255 || /[\\/\u0000]/.test(value)) {
      throw new Error('The extraction filename is invalid.');
    }
    return value;
  }

  private absolutePath(value: unknown): string {
    if (typeof value !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/.test(value)) {
      throw new Error('The extraction destination path is invalid.');
    }
    return value;
  }

  private nonnegativeNumber(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error(`The ${label} is invalid.`);
    return number;
  }
}
