import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { RuntimeFailureReporter } from './runtime-failure-reporter.js';
import type { IZoomEditPreviewProgress, IZoomEditPreviewRequest, IZoomEditPreviewService } from './zoom-edit-preview-service.js';

export type ZoomEditPreviewState =
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ kind: 'rendering'; progress: IZoomEditPreviewProgress | null }>
  | Readonly<{ kind: 'playing'; mediaSource: string }>
  | Readonly<{ kind: 'failed' }>;

type Preview = {
  readonly key: string;
  progress: IZoomEditPreviewProgress | null;
  mediaSource: string | null;
  failed: boolean;
};

const HIDDEN: ZoomEditPreviewState = Object.freeze({ kind: 'hidden' });
const FAILED: ZoomEditPreviewState = Object.freeze({ kind: 'failed' });

interface IZoomEditLoopPreviewEvents {
  changed: void;
}

// One preview is kept, for the staged edits it was rendered from.
export class ZoomEditLoopPreview implements IEventSource<IZoomEditLoopPreviewEvents> {
  private readonly events = new EventSource<IZoomEditLoopPreviewEvents>();
  private preview: Preview | null = null;
  private wanted = false;
  private failureUnseen = false;
  private disposed = false;

  constructor(private readonly service: IZoomEditPreviewService, private readonly failures: Pick<RuntimeFailureReporter, 'report'>) {}

  on<TName extends keyof IZoomEditLoopPreviewEvents>(name: TName, handler: EventHandler<IZoomEditLoopPreviewEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  get state(): ZoomEditPreviewState {
    const { preview } = this;
    if (this.failureUnseen) return FAILED;
    if (!this.wanted || !preview) return HIDDEN;
    if (preview.mediaSource) return Object.freeze({ kind: 'playing', mediaSource: preview.mediaSource });
    return Object.freeze({ kind: 'rendering', progress: preview.progress });
  }

  get isShown(): boolean {
    return this.wanted && this.preview !== null && !this.preview.failed;
  }

  hasFailed(request: IZoomEditPreviewRequest): boolean {
    return this.preview?.key === this.keyOf(request) && this.preview.failed;
  }

  show(request: IZoomEditPreviewRequest): void {
    if (this.disposed) return;
    const key = this.keyOf(request);
    if (this.preview?.key !== key) {
      this.discard();
      const preview: Preview = { key, progress: null, mediaSource: null, failed: false };
      this.preview = preview;
      void this.render(preview, request);
    }
    this.wanted = true;
    this.events.emit('changed');
  }

  // Also ends the notice of a failed preview, once the user has pressed another key.
  hide(): void {
    if (!this.wanted && !this.failureUnseen) return;
    this.wanted = false;
    this.failureUnseen = false;
    this.events.emit('changed');
  }

  discard(): void {
    if (!this.preview) return;
    this.preview = null;
    this.wanted = false;
    this.failureUnseen = false;
    void this.service.release().catch(error => this.failures.report('The previous preview could not be removed.', error));
    this.events.emit('changed');
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.preview = null;
    this.wanted = false;
    await this.service.release().catch(error => this.failures.report('The preview could not be removed.', error));
  }

  private async render(preview: Preview, request: IZoomEditPreviewRequest): Promise<void> {
    try {
      const mediaSource = await this.service.render(request, progress => {
        if (this.preview !== preview) return;
        preview.progress = progress;
        this.events.emit('changed');
      });
      if (this.preview !== preview) return;
      preview.mediaSource = mediaSource;
    } catch (error) {
      if (this.preview !== preview) return;
      preview.failed = true;
      this.failureUnseen = true;
      this.wanted = false;
      this.failures.report('The loop preview could not be made.', error);
    }
    this.events.emit('changed');
  }

  private keyOf({ folder, filename, source, sessionId, startFrame, endFrame }: IZoomEditPreviewRequest): string {
    return JSON.stringify([folder.folderPath, filename, source, sessionId, startFrame, endFrame]);
  }
}
