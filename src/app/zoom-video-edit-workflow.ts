import type { Clip } from '../domain/clip.js';
import type { ClipEditor, ClipEditorResult, CreatedVideoFile } from '../business-logic/clip-editor.js';
import type { VideoEdit } from '../business-logic/video-edit-catalog.js';

type WorkflowBaseEvent = {
  edit: VideoEdit;
  sourceClip: Clip;
};

type WorkflowCreatedEvent = WorkflowBaseEvent & { result: Extract<ClipEditorResult, { ok: true }>; createdFile: CreatedVideoFile };
type WorkflowFinishedEvent = WorkflowBaseEvent & { result: ClipEditorResult | ProcessFailedResult | null };

type WorkflowFailedEvent = WorkflowBaseEvent & { result: ClipEditorResult | ProcessFailedResult };

type ZoomVideoEditWorkflowOptions = {
  clipEditor: Pick<ClipEditor, 'createVideoEdit'>;
  onStarted?: (event: WorkflowBaseEvent) => void;
  onCreated?: (event: WorkflowCreatedEvent) => void;
  onFailed?: (event: WorkflowFailedEvent) => void;
  onFinished?: (event: WorkflowFinishedEvent) => void;
};

type NotRunnableResult = { ok: false; code: 'not-runnable' };
type ProcessFailedResult = { ok: false; code: 'process-failed' };

export class VideoEditNotificationError extends AggregateError {
  constructor(errors: unknown[], readonly result: ClipEditorResult | ProcessFailedResult | null) {
    const message = result?.ok
      ? 'The output clip was created, but updating the application failed.'
      : result
        ? 'Video editing failed, and updating the application also failed.'
        : 'Video editing did not start because an application callback failed.';
    super(errors, message);
    this.name = 'VideoEditNotificationError';
  }
}

export class ZoomVideoEditWorkflow {
  #isRunning: boolean;
  private readonly clipEditor: Pick<ClipEditor, 'createVideoEdit'>;
  private readonly onStarted: (event: WorkflowBaseEvent) => void;
  private readonly onCreated: (event: WorkflowCreatedEvent) => void;
  private readonly onFailed: (event: WorkflowFailedEvent) => void;
  private readonly onFinished: (event: WorkflowFinishedEvent) => void;

  constructor({
    clipEditor,
    onStarted = () => {},
    onCreated = () => {},
    onFailed = () => {},
    onFinished = () => {},
  }: ZoomVideoEditWorkflowOptions) {
    this.clipEditor = clipEditor;
    this.onStarted = onStarted;
    this.onCreated = onCreated;
    this.onFailed = onFailed;
    this.onFinished = onFinished;
    this.#isRunning = false;
  }

  isRunning(): boolean {
    return this.#isRunning;
  }

  async run({
    edit = null,
    sourceClip = null,
    folderSession = null,
  }: {
    edit?: VideoEdit | null;
    sourceClip?: Clip | null;
    folderSession?: { folderPath?: string } | null;
  } = {}): Promise<ClipEditorResult | ProcessFailedResult | NotRunnableResult> {
    if (this.#isRunning || !edit || !sourceClip || !folderSession) {
      return { ok: false, code: 'not-runnable' };
    }

    this.#isRunning = true;
    let result: ClipEditorResult | ProcessFailedResult | null = null;
    const notificationErrors: unknown[] = [];
    try {
      this.onStarted({ edit, sourceClip });
      try {
        result = await this.clipEditor.createVideoEdit({ clip: sourceClip, editId: edit.id, folderSession });
      } catch {
        result = { ok: false, code: 'process-failed' };
      }
      if (result.ok) {
        this.onCreated({ edit, sourceClip, result, createdFile: result.createdFile });
      } else {
        this.onFailed({ edit, sourceClip, result });
      }
    } catch (error) {
      notificationErrors.push(error);
    } finally {
      this.#isRunning = false;
      try {
        this.onFinished({ edit, sourceClip, result });
      } catch (error) {
        notificationErrors.push(error);
      }
    }
    if (notificationErrors.length) throw new VideoEditNotificationError(notificationErrors, result);
    if (!result) throw new Error('Video editing completed without a result.');
    return result;
  }
}
