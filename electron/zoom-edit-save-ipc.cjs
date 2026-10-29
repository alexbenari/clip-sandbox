const CHANNELS = Object.freeze({
  save: 'clip-sandbox:zoom-edit-save',
  cancel: 'clip-sandbox:zoom-edit-cancel-save',
  progress: 'clip-sandbox:zoom-edit-save-progress',
});

class ZoomEditSaveIpcBoundary {
  #ipcMain;
  #saver;

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
      operationId = this.#operationId(payload?.operationId, 'refine');
      const result = await this.#saver.save(event, {
        operationId,
        folderPath: payload?.folderPath,
        filename: payload?.filename,
        source: { kind: payload?.source?.kind, windowId: payload?.source?.windowId },
        sessionId: payload?.sessionId,
        startFrame: payload?.startFrame,
        endFrame: payload?.endFrame,
        outcome: payload?.outcome,
      }, progress => this.#sendProgress(event.sender, { operationId, ...progress }));
      return this.#envelope(operationId, result);
    } catch (error) {
      return this.#failure(operationId, error);
    }
  }

  async #cancel(event, payload) {
    let operationId = 'invalid-operation';
    try {
      operationId = this.#operationId(payload?.operationId, 'cancel');
      return this.#envelope(operationId, await this.#saver.cancel(event.sender.id, payload?.saveOperationId));
    } catch (error) {
      return this.#failure(operationId, error);
    }
  }

  #sendProgress(sender, progress) {
    try {
      if (!sender.isDestroyed?.()) sender.send(CHANNELS.progress, progress);
    } catch (error) {
      console.warn('[zoom-edit-save] progress-delivery-failed', { kind: error instanceof Error ? error.name : 'unknown' });
    }
  }

  #operationId(value, prefix) {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9_-]{8,120}$`).test(value)) {
      throw Object.assign(new Error('Zoom edit save operation id is invalid.'), { code: 'invalid-operation' });
    }
    return value;
  }

  #envelope(operationId, result) {
    return result?.ok === true
      ? { ok: true, operationId, result: result.result }
      : {
        ok: false,
        operationId,
        error: {
          code: String(result?.code || 'save-failed'),
          message: String(result?.error?.message || 'The refined clip could not be saved.').slice(0, 1024),
        },
      };
  }

  // Thrown messages can name files, so the renderer gets a fixed one.
  #failure(operationId, error) {
    const invalidOperation = error?.code === 'invalid-operation';
    return this.#envelope(operationId, {
      ok: false,
      code: invalidOperation ? 'invalid-operation' : 'save-failed',
      error: { message: invalidOperation ? 'Zoom edit save operation id is invalid.' : 'The refined clip could not be saved.' },
    });
  }
}

function registerZoomEditSaveIpc(options) {
  return new ZoomEditSaveIpcBoundary(options).register();
}

module.exports = { CHANNELS, registerZoomEditSaveIpc };
