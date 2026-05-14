// @ts-nocheck
export class ZoomVideoEditWorkflow {
  #isRunning;

  constructor({
    clipEditor,
    onStarted = () => {},
    onCreated = () => {},
    onFailed = () => {},
    onFinished = () => {},
  } = {}) {
    this.clipEditor = clipEditor;
    this.onStarted = onStarted;
    this.onCreated = onCreated;
    this.onFailed = onFailed;
    this.onFinished = onFinished;
    this.#isRunning = false;
  }

  isRunning() {
    return this.#isRunning;
  }

  async run({
    edit = null,
    sourceClip = null,
    folderSession = null,
  } = {}) {
    if (this.#isRunning || !edit || !sourceClip || !folderSession) {
      return { ok: false, code: 'not-runnable' };
    }

    this.#isRunning = true;
    this.onStarted({ edit, sourceClip });

    let result = null;
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

export function createZoomVideoEditWorkflow(options) {
  return new ZoomVideoEditWorkflow(options);
}
