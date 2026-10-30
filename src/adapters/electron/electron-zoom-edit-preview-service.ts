import type {
  IZoomEditPreviewProgress,
  IZoomEditPreviewRequest,
  IZoomEditPreviewService,
} from '../../app/zoom-edit-preview-service.js';

interface IWireResponse {
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface IZoomEditPreviewApi {
  subscribePreviewProgress(listener: (value: unknown) => void): () => void;
  preview(request: unknown): Promise<IWireResponse>;
  releasePreview(): Promise<unknown>;
}

type ZoomEditPreviewWindow = Window & { clipSandboxDesktop?: { zoomEdit?: Partial<IZoomEditPreviewApi> } };

export class ElectronZoomEditPreviewService implements IZoomEditPreviewService {
  private readonly api: IZoomEditPreviewApi;
  private operationSequence = 0;

  static tryCreate(win: ZoomEditPreviewWindow = window): ElectronZoomEditPreviewService | null {
    return win.clipSandboxDesktop?.zoomEdit?.preview ? new ElectronZoomEditPreviewService(win) : null;
  }

  constructor(win: ZoomEditPreviewWindow = window) {
    const api = win.clipSandboxDesktop?.zoomEdit;
    if (!api || typeof api.subscribePreviewProgress !== 'function' || typeof api.preview !== 'function'
      || typeof api.releasePreview !== 'function') {
      throw new Error('Electron zoom edit preview API is unavailable.');
    }
    this.api = api as IZoomEditPreviewApi;
  }

  async render(request: IZoomEditPreviewRequest, onProgress?: (progress: IZoomEditPreviewProgress) => void): Promise<string> {
    this.operationSequence += 1;
    const operationId = `preview_${Date.now()}_${this.operationSequence}`;
    const unsubscribe = this.api.subscribePreviewProgress(value => {
      const progress = this.progressOf(value, operationId);
      if (progress) onProgress?.(progress);
    });
    try {
      return this.mediaSourceOf(await this.api.preview({
        operationId,
        folderPath: request.folder.folderPath,
        filename: request.filename,
        source: request.source.kind === 'window' ? { kind: 'window', windowId: request.source.windowId } : { kind: 'clip' },
        sessionId: request.sessionId,
        startFrame: request.startFrame,
        endFrame: request.endFrame,
      }));
    } finally {
      unsubscribe();
    }
  }

  async release(): Promise<void> {
    await this.api.releasePreview();
  }

  private progressOf(value: unknown, operationId: string): IZoomEditPreviewProgress | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { operationId: eventOperationId, renderedFrames, totalFrames } = value as Record<string, unknown>;
    const isCount = (count: unknown): count is number => Number.isSafeInteger(count) && Number(count) >= 0;
    if (eventOperationId !== operationId || !isCount(renderedFrames) || !isCount(totalFrames)
      || totalFrames < 1 || renderedFrames > totalFrames) return null;
    return Object.freeze({ renderedFrames, totalFrames });
  }

  private mediaSourceOf(response: IWireResponse): string {
    if (response?.ok !== true) {
      const error = response?.error as Record<string, unknown> | undefined;
      const failure = new Error(typeof error?.message === 'string' ? error.message.slice(0, 1024) : 'The preview could not be made.');
      Object.defineProperty(failure, 'code', { value: typeof error?.code === 'string' ? error.code : 'preview-failed' });
      throw failure;
    }
    const mediaSource = (response.result as Record<string, unknown> | undefined)?.mediaSource;
    if (typeof mediaSource !== 'string' || !mediaSource.startsWith('file:')) throw new Error('The zoom edit preview answer is invalid.');
    return mediaSource;
  }
}
