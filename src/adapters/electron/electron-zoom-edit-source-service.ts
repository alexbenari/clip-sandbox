import type {
  IZoomEditClipRequest,
  IZoomEditWindowRequest,
  IZoomEditSourceService,
  ZoomEditAnchorAnswer,
  ZoomEditWindowAnswer,
} from '../../app/zoom-edit-source-service.js';
import {
  FrameReviewOpaqueId,
  type FrameReviewSessionId,
  type FrameReviewSourceHandle,
} from '../../frame-review/frame-review-api.js';
import { OpaqueHandle } from '../../frame-review/opaque-handle.js';

type ZoomEditApi = {
  openClip(request: Readonly<{ folderPath: string; filename: string }>): Promise<unknown>;
  openWindow(request: Readonly<{ folderPath: string; filename: string; widen: number; previousWindowId?: string }>): Promise<unknown>;
  anchorWindow(request: Readonly<{ windowId: string; sessionId: string }>): Promise<unknown>;
};

type ZoomEditWindow = Window & { clipSandboxDesktop?: { zoomEdit?: ZoomEditApi } };

export class ElectronZoomEditSourceService implements IZoomEditSourceService {
  private readonly api: ZoomEditApi;

  static tryCreate(win: ZoomEditWindow = window): ElectronZoomEditSourceService | null {
    return win.clipSandboxDesktop?.zoomEdit ? new ElectronZoomEditSourceService(win) : null;
  }

  constructor(win: ZoomEditWindow = window) {
    const api = win.clipSandboxDesktop?.zoomEdit;
    if (!api || typeof api.openClip !== 'function' || typeof api.openWindow !== 'function'
      || typeof api.anchorWindow !== 'function') {
      throw new Error('Electron zoom edit API is unavailable.');
    }
    this.api = api;
  }

  async openClip(request: IZoomEditClipRequest): Promise<FrameReviewSourceHandle> {
    const answer = this.record(await this.api.openClip({ folderPath: request.folder.folderPath, filename: request.filename }), 'clip');
    return FrameReviewOpaqueId.sourceHandle(answer.sourceHandle);
  }

  async openWindow(request: IZoomEditWindowRequest): Promise<ZoomEditWindowAnswer> {
    const answer = this.record(await this.api.openWindow({
      folderPath: request.folder.folderPath, filename: request.filename, widen: request.widen,
      ...(request.previousWindowId === undefined ? {} : { previousWindowId: request.previousWindowId }),
    }), 'window');
    if (answer.kind === 'cancelled' || answer.kind === 'no-source-info' || answer.kind === 'movie-only') return Object.freeze({ kind: answer.kind });
    if (answer.kind !== 'ready') throw this.invalidAnswer('window');
    return Object.freeze({
      kind: 'ready',
      sourceHandle: FrameReviewOpaqueId.sourceHandle(answer.sourceHandle),
      windowId: OpaqueHandle.parse(answer.windowId, 'zoom edit window id'),
    });
  }

  async anchorWindow(request: Readonly<{ windowId: string; sessionId: FrameReviewSessionId }>): Promise<ZoomEditAnchorAnswer> {
    const answer = this.record(await this.api.anchorWindow({ windowId: request.windowId, sessionId: request.sessionId }), 'anchor');
    if (answer.kind === 'not-found') return Object.freeze({ kind: 'not-found' });
    const { kind, clipStartFrame, earliestFrame, latestFrame } = answer;
    if (kind !== 'anchored' || !this.isFrame(clipStartFrame) || !this.isFrame(earliestFrame) || !this.isFrame(latestFrame)
      || earliestFrame > clipStartFrame || clipStartFrame > latestFrame) {
      throw this.invalidAnswer('anchor');
    }
    return Object.freeze({ kind: 'anchored', clipStartFrame, earliestFrame, latestFrame });
  }

  private isFrame(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  private record(value: unknown, answerName: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.invalidAnswer(answerName);
    return value as Record<string, unknown>;
  }

  private invalidAnswer(answerName: string): Error {
    return new Error(`The zoom edit ${answerName} answer is invalid.`);
  }
}
