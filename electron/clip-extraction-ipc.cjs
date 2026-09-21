const CHANNELS = Object.freeze({
  open: 'clip-sandbox:clip-extraction-open-destination',
  extract: 'clip-sandbox:clip-extraction-extract',
  saveCollection: 'clip-sandbox:clip-extraction-save-collection',
  cancel: 'clip-sandbox:clip-extraction-cancel',
});

class ClipExtractionIpcBoundary {
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
    return () => Object.values(CHANNELS).forEach(channel => this.ipcMain.removeHandler(channel));
  }

  async open(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.operationId(payload?.operationId, 'destination');
      return this.envelope(operationId, await this.runtime.openDestination(event.sender.id));
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async extract(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.operationId(payload?.operationId, 'extract');
      const result = await this.runtime.extract(event.sender.id, this.hostForEvent(event), {
        operationId,
        destinationHandle: payload?.destinationHandle,
        sourceHandle: payload?.sourceHandle,
        sourceGeneration: payload?.sourceGeneration,
        collectionName: payload?.collectionName,
        startFrameIndex: payload?.startFrameIndex,
        endFrameIndex: payload?.endFrameIndex,
      });
      return this.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async saveCollection(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.operationId(payload?.operationId, 'publication');
      const result = await this.runtime.saveCollection(event.sender.id, {
        destinationHandle: payload?.destinationHandle,
        filename: payload?.filename,
        text: payload?.text,
      });
      return this.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async cancel(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.operationId(payload?.operationId, 'cancel');
      const result = await this.runtime.cancel(event.sender.id, payload?.extractionOperationId);
      return this.envelope(operationId, result);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  operationId(value, prefix) {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9_-]{8,120}$`).test(value)) {
      const error = new Error('Clip-extraction operation id is invalid.');
      error.code = 'invalid-operation';
      throw error;
    }
    return value;
  }

  envelope(operationId, result) {
    return result?.ok === true
      ? { ok: true, operationId, result: result.result }
      : {
        ok: false,
        operationId,
        error: {
          code: String(result?.code || 'extraction-failed'),
          message: String(result?.error?.message || 'Clip extraction failed.').slice(0, 1024),
        },
      };
  }

  failure(operationId, error) {
    return this.envelope(operationId, {
      ok: false,
      code: error?.code || 'invalid-request',
      error: { message: error instanceof Error ? error.message : 'Clip-extraction request is invalid.' },
    });
  }
}

function registerClipExtractionIpc(options) {
  return new ClipExtractionIpcBoundary(options).register();
}

module.exports = { CHANNELS, ClipExtractionIpcBoundary, registerClipExtractionIpc };
