import type {
  IRefinedClipSaveProgress,
  IRefinedClipSaveRequest,
  IRefinedClipSaveService,
  ISavedClipEntry,
  KeptBothClipNotice,
  RefinedClipSaveStage,
  ReplacedClipNotice,
  SavedRefinedClip,
} from '../../app/refined-clip-save-service.js';

interface IWireResponse {
  readonly ok?: boolean;
  readonly operationId?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface IRefinedClipSaveApi {
  subscribeSaveProgress(listener: (value: unknown) => void): () => void;
  save(request: unknown): Promise<IWireResponse>;
  cancelSave(saveOperationId: string): Promise<IWireResponse>;
}

type RefinedClipSaveWindow = Window & { clipSandboxDesktop?: { zoomEdit?: Partial<IRefinedClipSaveApi> } };

const STAGES: readonly RefinedClipSaveStage[] = ['checking-source', 'encoding-video', 'exact-fallback', 'adding-audio', 'saving-media'];
const REPLACED_NOTICES: readonly ReplacedClipNotice[] = ['name-taken', 'rename-failed'];
const KEPT_BOTH_NOTICES: readonly KeptBothClipNotice[] = ['recycle-bin-refused', 'name-taken'];

export class ElectronRefinedClipSaveService implements IRefinedClipSaveService {
  private readonly api: IRefinedClipSaveApi;
  private operationSequence = 0;
  private currentOperationId: string | null = null;

  static tryCreate(win: RefinedClipSaveWindow = window): ElectronRefinedClipSaveService | null {
    return win.clipSandboxDesktop?.zoomEdit?.save ? new ElectronRefinedClipSaveService(win) : null;
  }

  constructor(win: RefinedClipSaveWindow = window) {
    const api = win.clipSandboxDesktop?.zoomEdit;
    if (!api || typeof api.subscribeSaveProgress !== 'function' || typeof api.save !== 'function'
      || typeof api.cancelSave !== 'function') {
      throw new Error('Electron refined clip save API is unavailable.');
    }
    this.api = api as IRefinedClipSaveApi;
  }

  async save(request: IRefinedClipSaveRequest, onProgress?: (progress: IRefinedClipSaveProgress) => void): Promise<SavedRefinedClip> {
    this.operationSequence += 1;
    const operationId = `refine_${Date.now()}_${this.operationSequence}`;
    this.currentOperationId = operationId;
    const unsubscribe = this.api.subscribeSaveProgress(value => {
      const progress = this.progressOf(value, operationId);
      if (progress) onProgress?.(progress);
    });
    try {
      return this.savedClipOf(this.resultOrThrow(await this.api.save({
        operationId,
        folderPath: request.folder.folderPath,
        filename: request.filename,
        source: request.source.kind === 'window' ? { kind: 'window', windowId: request.source.windowId } : { kind: 'clip' },
        sessionId: request.sessionId,
        startFrame: request.startFrame,
        endFrame: request.endFrame,
        outcome: request.outcome,
      })));
    } finally {
      unsubscribe();
      if (this.currentOperationId === operationId) this.currentOperationId = null;
    }
  }

  async cancelSave(): Promise<void> {
    const operationId = this.currentOperationId;
    if (!operationId) return;
    this.resultOrThrow(await this.api.cancelSave(operationId));
  }

  private progressOf(value: unknown, operationId: string): IRefinedClipSaveProgress | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { operationId: eventOperationId, stage, encodedFrames, totalFrames } = value as Record<string, unknown>;
    if (eventOperationId !== operationId || !STAGES.includes(stage as RefinedClipSaveStage)) return null;
    const isCount = (count: unknown, minimum: number): count is number => Number.isSafeInteger(count) && Number(count) >= minimum;
    if ((encodedFrames !== undefined && !isCount(encodedFrames, 0)) || (totalFrames !== undefined && !isCount(totalFrames, 1))) return null;
    if (isCount(encodedFrames, 0) && isCount(totalFrames, 1) && encodedFrames > totalFrames) return null;
    return Object.freeze({
      stage: stage as RefinedClipSaveStage,
      ...(encodedFrames === undefined ? {} : { encodedFrames: encodedFrames as number }),
      ...(totalFrames === undefined ? {} : { totalFrames: totalFrames as number }),
    });
  }

  private savedClipOf(value: unknown): SavedRefinedClip {
    const answer = this.objectOf(value, 'saved clip');
    const filename = this.plainFilenameOf(answer.filename);
    const entry = this.entryOf(answer.entry, filename);
    const warning = answer.warning === undefined ? {} : { warning: this.boundedText(answer.warning) };
    if (answer.outcome === 'replaced') {
      const notice = this.noticeOf(answer.notice, REPLACED_NOTICES);
      if (notice.notice !== undefined && answer.replacedFilename === undefined) throw this.invalidAnswer('saved clip');
      const replaced = answer.replacedFilename === undefined ? {} : { replacedFilename: this.plainFilenameOf(answer.replacedFilename) };
      return Object.freeze({ outcome: 'replaced', filename, entry, ...replaced, ...notice, ...warning });
    }
    if (answer.outcome === 'kept-both' && answer.replacedFilename === undefined) {
      return Object.freeze({ outcome: 'kept-both', filename, entry, ...this.noticeOf(answer.notice, KEPT_BOTH_NOTICES), ...warning });
    }
    throw this.invalidAnswer('saved clip');
  }

  private noticeOf<Notice extends string>(value: unknown, allowed: readonly Notice[]): { notice?: Notice } {
    if (value === undefined) return {};
    if (!allowed.includes(value as Notice)) throw this.invalidAnswer('saved clip');
    return { notice: value as Notice };
  }

  private entryOf(value: unknown, filename: string): ISavedClipEntry {
    const { name, path, mediaSource, type, size, lastModifiedMs } = this.objectOf(value, 'saved clip entry');
    if (name !== filename || typeof path !== 'string' || !this.isPathOf(path, filename)
      || typeof mediaSource !== 'string' || !mediaSource.startsWith('file:')
      || type !== 'video/mp4' || !this.isNonnegative(size) || !this.isNonnegative(lastModifiedMs)) {
      throw this.invalidAnswer('saved clip entry');
    }
    return Object.freeze({ name: filename, path, mediaSource, type, size, lastModifiedMs });
  }

  private isPathOf(path: string, filename: string): boolean {
    const folderSeparator = path.charAt(path.length - filename.length - 1);
    return path.endsWith(filename) && (folderSeparator === '\\' || folderSeparator === '/');
  }

  private resultOrThrow(response: IWireResponse): unknown {
    if (response?.ok === true) return response.result;
    const error = this.objectOf(response?.error, 'refined clip save error');
    const failure = new Error(typeof error.message === 'string' ? error.message.slice(0, 1024) : 'The refined clip could not be saved.');
    Object.defineProperty(failure, 'code', { value: typeof error.code === 'string' ? error.code : 'save-failed' });
    throw failure;
  }

  private plainFilenameOf(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 255 || /[\\/:\u0000]/.test(value) || value === '.' || value === '..') {
      throw this.invalidAnswer('saved clip filename');
    }
    return value;
  }

  private boundedText(value: unknown): string {
    if (typeof value !== 'string') throw this.invalidAnswer('saved clip warning');
    return value.slice(0, 1024);
  }

  private isNonnegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  private objectOf(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.invalidAnswer(label);
    return value as Record<string, unknown>;
  }

  private invalidAnswer(label: string): Error {
    return new Error(`The ${label} answer is invalid.`);
  }
}
