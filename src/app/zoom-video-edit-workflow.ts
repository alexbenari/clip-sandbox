import type { Clip } from '../domain/clip.js';
import type { ClipEditor, ClipEditorResult, CreatedVideoFile } from '../business-logic/clip-editor.js';
import type { VideoEdit } from '../business-logic/video-edit-catalog.js';

type WorkflowBaseEvent = {
  edit: VideoEdit;
  sourceClip: Clip;
};

type WorkflowCreatedEvent = WorkflowBaseEvent & { result: Extract<ClipEditorResult, { ok: true }>; createdFile: CreatedVideoFile };
type WorkflowFailedEvent = WorkflowBaseEvent & { result: ClipEditorResult | ProcessFailedResult };

type ZoomVideoEditWorkflowOptions = {
  clipEditor: Pick<ClipEditor, 'createVideoEdit'>;
  onStarted?: (event: WorkflowBaseEvent) => void;
  onCreated?: (event: WorkflowCreatedEvent) => void;
  onFailed?: (event: WorkflowFailedEvent) => void;
  onFinished?: (event: WorkflowFailedEvent | WorkflowCreatedEvent) => void;
};

type NotRunnableResult = { ok: false; code: 'not-runnable' };
type ProcessFailedResult = { ok: false; code: 'process-failed' };

export class ZoomVideoEditWorkflow {
  #isRunning: boolean;
  clipEditor: Pick<ClipEditor, 'createVideoEdit'>;
  onStarted: (event: WorkflowBaseEvent) => void;
  onCreated: (event: WorkflowCreatedEvent) => void;
  onFailed: (event: WorkflowFailedEvent) => void;
  onFinished: (event: WorkflowFailedEvent | WorkflowCreatedEvent) => void;

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
    this.onStarted({ edit, sourceClip });

    let result: ClipEditorResult | ProcessFailedResult;
    try {
      result = await this.clipEditor.createVideoEdit({
        clip: sourceClip,
        editId: edit.id,
        folderSession,
      });
    } catch {
      result = { ok: false, code: 'process-failed' };
    }

    if (result?.ok && result.createdFile) {
      this.onCreated({ edit, sourceClip, result, createdFile: result.createdFile });
    } else {
      this.onFailed({ edit, sourceClip, result });
    }

    this.#isRunning = false;
    this.onFinished({ edit, sourceClip, result });
    return result;
  }
}

export function createZoomVideoEditWorkflow(options: ZoomVideoEditWorkflowOptions): ZoomVideoEditWorkflow {
  return new ZoomVideoEditWorkflow(options);
}
