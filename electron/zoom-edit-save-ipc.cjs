const { CorrelatedIpcReplies } = require('./correlated-ipc-replies.cjs');

const CHANNELS = Object.freeze({
  save: 'clip-sandbox:zoom-edit-save',
  cancel: 'clip-sandbox:zoom-edit-cancel-save',
  progress: 'clip-sandbox:zoom-edit-save-progress',
});

class ZoomEditSaveIpcBoundary {
  #ipcMain;
  #saver;
  #replies = new CorrelatedIpcReplies({
    label: 'Zoom edit save', failureCode: 'save-failed', failureMessage: 'The refined clip could not be saved.', logPrefix: 'zoom-edit-save',
  });

  constructor({ ipcMain, saver }) {
    if (!ipcMain?.handle || !saver) throw new Error('Zoom edit save IPC dependencies are invalid.');
    this.#ipcMain = ipcMain;
    this.#saver = saver;
  }

  register() {
    this.#ipcMain.handle(CHANNELS.save, (event, payload) => this.#save(event, payload));
    this.#ipcMain.handle(CHANNELS.cancel, (event, payload) => this.#cancel(event, payload));
    return () => [CHANNELS.save, CHANNELS.cancel].forEach(channel => this.#ipcMain.removeHandler(channel));
  }

  async #save(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'refine');
      const result = await this.#saver.save(event, {
        operationId,
        folderPath: payload?.folderPath,
        filename: payload?.filename,
        source: { kind: payload?.source?.kind, windowId: payload?.source?.windowId },
        sessionId: payload?.sessionId,
        startFrame: payload?.startFrame,
        endFrame: payload?.endFrame,
        loopify: payload?.loopify,
        outcome: payload?.outcome,
      }, progress => this.#replies.sendProgress(event.sender, CHANNELS.progress, { operationId, ...progress }));
      return this.#replies.envelope(operationId, result);
    } catch (error) {
      return this.#replies.failure(operationId, error);
    }
  }

  async #cancel(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'cancel');
      return this.#replies.envelope(operationId, await this.#saver.cancel(event.sender.id, payload?.saveOperationId));
    } catch (error) {
      return this.#replies.failure(operationId, error);
    }
  }
}

function registerZoomEditSaveIpc(options) {
  return new ZoomEditSaveIpcBoundary(options).register();
}

module.exports = { CHANNELS, registerZoomEditSaveIpc };
