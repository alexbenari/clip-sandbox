const { CorrelatedIpcReplies } = require('./correlated-ipc-replies.cjs');
const { OperationResult } = require('./operation-result.cjs');

const CHANNELS = Object.freeze({
  open: 'clip-sandbox:clip-extraction-open-destination',
  extract: 'clip-sandbox:clip-extraction-extract',
  saveCollection: 'clip-sandbox:clip-extraction-save-collection',
  cancel: 'clip-sandbox:clip-extraction-cancel',
  progress: 'clip-sandbox:clip-extraction-progress',
});

class ClipExtractionIpcBoundary {
  #replies = new CorrelatedIpcReplies({
    label: 'Clip-extraction', failureCode: 'extraction-failed', failureMessage: 'Clip extraction failed.', logPrefix: 'clip-extraction',
  });

  constructor({ ipcMain, runtime, hostForEvent }) {
    if (!ipcMain?.handle || !runtime || typeof hostForEvent !== 'function') {
      throw new Error('Clip-extraction IPC dependencies are invalid.');
    }
    this.ipcMain = ipcMain;
    this.runtime = runtime;
    this.hostForEvent = hostForEvent;
  }

  register() {
    this.ipcMain.handle(CHANNELS.open, (event, payload) => this.open(event, payload));
    this.ipcMain.handle(CHANNELS.extract, (event, payload) => this.extract(event, payload));
    this.ipcMain.handle(CHANNELS.saveCollection, (event, payload) => this.saveCollection(event, payload));
    this.ipcMain.handle(CHANNELS.cancel, (event, payload) => this.cancel(event, payload));
    return () => [CHANNELS.open, CHANNELS.extract, CHANNELS.saveCollection, CHANNELS.cancel]
      .forEach(channel => this.ipcMain.removeHandler(channel));
  }

  async open(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'destination');
      return this.#replies.envelope(operationId, await this.runtime.openDestination(event.sender.id));
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async extract(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'extract');
      const result = await this.runtime.extract(event.sender.id, this.hostForEvent(event), {
        operationId,
        destinationHandle: payload?.destinationHandle,
        sourceHandle: payload?.sourceHandle,
        sourceGeneration: payload?.sourceGeneration,
        collectionName: payload?.collectionName,
        startFrameIndex: payload?.startFrameIndex,
        endFrameIndex: payload?.endFrameIndex,
        reviewSessionId: payload?.reviewSessionId,
      }, progress => this.#replies.sendProgress(event.sender, CHANNELS.progress, { operationId, ...progress }));
      return this.#replies.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async saveCollection(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'publication');
      const result = await this.runtime.saveCollection(event.sender.id, {
        destinationHandle: payload?.destinationHandle,
        filename: payload?.filename,
        text: payload?.text,
      });
      return this.#replies.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async cancel(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#replies.operationId(payload?.operationId, 'cancel');
      const result = await this.runtime.cancel(event.sender.id, payload?.extractionOperationId);
      return this.#replies.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  failure(operationId, error) {
    return this.#replies.envelope(operationId, OperationResult.failure(
      error?.code || 'invalid-request', error instanceof Error ? error.message : 'Clip-extraction request is invalid.'));
  }
}

function registerClipExtractionIpc(options) {
  return new ClipExtractionIpcBoundary(options).register();
}

module.exports = { CHANNELS, ClipExtractionIpcBoundary, registerClipExtractionIpc };
