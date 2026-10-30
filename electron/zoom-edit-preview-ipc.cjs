const { CorrelatedIpcReplies } = require('./correlated-ipc-replies.cjs');

const CHANNELS = Object.freeze({
  preview: 'clip-sandbox:zoom-edit-preview',
  release: 'clip-sandbox:zoom-edit-release-preview',
  progress: 'clip-sandbox:zoom-edit-preview-progress',
});

class ZoomEditPreviewIpcBoundary {
  #ipcMain;
  #previews;
  #replies = new CorrelatedIpcReplies({
    label: 'Zoom edit preview', failureCode: 'preview-failed', failureMessage: 'The preview could not be made.', logPrefix: 'zoom-edit-preview',
  });

  constructor({ ipcMain, previews }) {
    if (!ipcMain?.handle || !previews) throw new Error('Zoom edit preview IPC dependencies are invalid.');
    this.#ipcMain = ipcMain;
    this.#previews = previews;
  }

  register() {
    this.#ipcMain.handle(CHANNELS.preview, (event, payload) => this.#preview(event, payload));
    this.#ipcMain.handle(CHANNELS.release, event => this.#release(event));
    return () => [CHANNELS.preview, CHANNELS.release].forEach(channel => this.#ipcMain.removeHandler(channel));
  }

  async #preview(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'preview');
      const result = await this.#previews.render(event, {
        folderPath: payload?.folderPath,
        filename: payload?.filename,
        source: { kind: payload?.source?.kind, windowId: payload?.source?.windowId },
        sessionId: payload?.sessionId,
        startFrame: payload?.startFrame,
        endFrame: payload?.endFrame,
      }, progress => this.#replies.sendProgress(event.sender, CHANNELS.progress, { operationId, ...progress }));
      return this.#replies.envelope(operationId, result);
    } catch (error) {
      return this.#replies.failure(operationId, error);
    }
  }

  async #release(event) {
    await this.#previews.release(event.sender.id);
    return { ok: true };
  }
}

function registerZoomEditPreviewIpc(options) {
  return new ZoomEditPreviewIpcBoundary(options).register();
}

module.exports = { CHANNELS, registerZoomEditPreviewIpc };
