const path = require('node:path');

const CHANNELS = Object.freeze({
  chooseSource: 'clip-sandbox:frame-review-choose-source',
  open: 'clip-sandbox:frame-review-open',
  command: 'clip-sandbox:frame-review-command',
  close: 'clip-sandbox:frame-review-close',
  event: 'clip-sandbox:frame-review-event',
});

const COMMANDS = new Set([
  'state', 'play', 'pause', 'set-rate', 'seek-playback', 'enter-scrub', 'scrub-to-frame',
  'step-adjacent', 'press-adjacent', 'release-adjacent', 'capture-current-point',
]);

class FrameReviewIpcBoundary {
  constructor({ ipcMain, hostForEvent, chooseSourcePath }) {
    if (!ipcMain?.handle || typeof hostForEvent !== 'function' || typeof chooseSourcePath !== 'function') {
      throw new Error('Frame-review IPC dependencies are invalid.');
    }
    this.ipcMain = ipcMain;
    this.hostForEvent = hostForEvent;
    this.chooseSourcePath = chooseSourcePath;
  }

  register() {
    this.ipcMain.handle(CHANNELS.chooseSource, (event, payload) => this.chooseSource(event, payload));
    this.ipcMain.handle(CHANNELS.open, (event, payload) => this.open(event, payload));
    this.ipcMain.handle(CHANNELS.command, (event, payload) => this.command(event, payload));
    this.ipcMain.handle(CHANNELS.close, (event, payload) => this.close(event, payload));
    return () => {
      this.ipcMain.removeHandler(CHANNELS.chooseSource);
      this.ipcMain.removeHandler(CHANNELS.open);
      this.ipcMain.removeHandler(CHANNELS.command);
      this.ipcMain.removeHandler(CHANNELS.close);
    };
  }

  async chooseSource(event, payload) {
    let operationId = 'invalid-operation';
    try {
      const record = this.record(payload);
      operationId = this.operationId(record.operationId);
      const sourcePath = await this.chooseSourcePath(event);
      if (!sourcePath) return this.success(operationId, { canceled: true });
      if (!path.isAbsolute(sourcePath)) throw this.invalid('Selected movie path is invalid.');
      const sourceHandle = this.requireHost(event).registerSource(sourcePath);
      return this.success(operationId, {
        canceled: false,
        name: path.basename(sourcePath),
        sourceHandle,
      });
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async open(event, payload) {
    let operationId = 'invalid-operation';
    try {
      const request = this.openRequest(payload);
      operationId = request.operationId;
      const host = this.requireHost(event);
      const buffered = [];
      let sessionId = null;
      const emit = (hostEvent) => {
        const message = { sessionId, event: this.toWire(hostEvent) };
        if (sessionId) event.sender.send(CHANNELS.event, message);
        else buffered.push(message);
      };
      const session = await host.open({
        sourceHandle: request.sourceHandle,
        previewBounds: request.previewBounds,
        emit,
      });
      sessionId = session.id;
      for (const message of buffered) {
        event.sender.send(CHANNELS.event, { ...message, sessionId });
      }
      return this.success(operationId, { sessionId, state: this.toWire(session.state()) });
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async command(event, payload) {
    let operationId = 'invalid-operation';
    try {
      const request = this.commandRequest(payload);
      operationId = request.operationId;
      const session = this.requireHost(event).session(request.sessionId);
      const result = await this.execute(session, request.command, request.args);
      return this.success(operationId, this.toWire(result ?? null));
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  async close(event, payload) {
    let operationId = 'invalid-operation';
    try {
      const request = this.baseRequest(payload);
      operationId = request.operationId;
      await this.requireHost(event).closeSession(request.sessionId);
      return this.success(operationId, null);
    } catch (error) {
      return this.failure(operationId, error);
    }
  }

  execute(session, command, args) {
    switch (command) {
      case 'state': return session.state();
      case 'play': return session.play();
      case 'pause': return session.pause();
      case 'set-rate': return session.setRate(this.finite(args.rate, 'rate'));
      case 'seek-playback': return session.seekPlayback(this.decimalBigInt(args.timestampUs, 'timestampUs'));
      case 'enter-scrub': return session.enterFrameScrub();
      case 'scrub-to-frame': return session.scrubToFrame(this.nonnegativeInteger(args.frameIndex, 'frameIndex'));
      case 'step-adjacent': return session.stepAdjacent(this.direction(args.direction));
      case 'press-adjacent': return session.pressAdjacent(this.direction(args.direction));
      case 'release-adjacent': return session.releaseAdjacent(
        args.direction === undefined ? undefined : this.direction(args.direction));
      case 'capture-current-point': return session.captureCurrentPoint();
      default: throw this.invalid('Unknown frame-review command.');
    }
  }

  openRequest(payload) {
    const record = this.record(payload);
    const operationId = this.operationId(record.operationId);
    const sourceHandle = this.opaqueId(record.sourceHandle, 'source');
    const bounds = this.record(record.previewBounds);
    const maxWidth = this.positiveInteger(bounds.maxWidth, 'maxWidth');
    const maxHeight = this.positiveInteger(bounds.maxHeight, 'maxHeight');
    if (maxWidth > 16384 || maxHeight > 16384 || maxWidth * maxHeight * 4 > 256 * 1024 * 1024) {
      throw this.invalid('Frame-review preview bounds exceed the bridge limit.');
    }
    return { operationId, sourceHandle, previewBounds: { maxWidth, maxHeight } };
  }

  commandRequest(payload) {
    const request = this.baseRequest(payload);
    if (typeof payload.command !== 'string' || !COMMANDS.has(payload.command)) {
      throw this.invalid('Unknown frame-review command.');
    }
    return { ...request, command: payload.command, args: payload.args === undefined ? {} : this.record(payload.args) };
  }

  baseRequest(payload) {
    const record = this.record(payload);
    return {
      operationId: this.operationId(record.operationId),
      sessionId: this.opaqueId(record.sessionId, 'session'),
    };
  }

  requireHost(event) {
    const host = this.hostForEvent(event);
    if (!host) throw this.invalid('No frame-review host exists for this window.');
    return host;
  }

  record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.invalid('IPC payload must be an object.');
    return value;
  }

  operationId(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(value)) throw this.invalid('Operation id is invalid.');
    return value;
  }

  opaqueId(value, kind) {
    if (typeof value !== 'string' || !new RegExp(`^${kind}_[a-zA-Z0-9_-]{8,120}$`).test(value)) {
      throw this.invalid(`${kind} id is invalid.`);
    }
    return value;
  }

  positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) throw this.invalid(`${label} must be a positive integer.`);
    return value;
  }

  nonnegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw this.invalid(`${label} must not be negative.`);
    return value;
  }

  finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw this.invalid(`${label} must be finite.`);
    return value;
  }

  decimalBigInt(value, label) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw this.invalid(`${label} must be a decimal integer string.`);
    return BigInt(value);
  }

  direction(value) {
    if (value !== -1 && value !== 1) throw this.invalid('Adjacent direction must be -1 or 1.');
    return value;
  }

  toWire(value) {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Uint8Array) return value;
    if (Array.isArray(value)) return value.map((item) => this.toWire(item));
    if (value && typeof value === 'object') {
      if (value.type === 'error') {
        return {
          type: 'error',
          category: String(value.category || 'backend-failure'),
          message: this.publicErrorMessage(value.category),
          recoverable: value.recoverable === true,
        };
      }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.toWire(item)]));
    }
    return value;
  }

  success(operationId, result) { return { ok: true, operationId, result }; }

  failure(operationId, error) {
    return {
      ok: false,
      operationId,
      error: {
        category: typeof error?.category === 'string' ? error.category : 'invalid-request',
        message: this.publicErrorMessage(error?.category, error?.message),
        recoverable: error?.recoverable === true,
      },
    };
  }

  invalid(message) {
    const error = new Error(message);
    error.category = 'invalid-request';
    error.recoverable = true;
    return error;
  }

  publicErrorMessage(category, fallback) {
    switch (category) {
      case 'cache-unavailable': return 'Prepared-review caches under the application folder are not writable.';
      case 'process-crash': return 'The frame-review native service is unavailable. Build or reinstall the frame-review runtime.';
      case 'timeout': return 'The frame-review native service did not respond in time.';
      case 'protocol-error': return 'The frame-review native service returned incompatible data.';
      case 'backend-failure': return 'Exact frame review could not be prepared.';
      default: return String(fallback || 'Frame review failed.').slice(0, 1024);
    }
  }
}

function registerFrameReviewIpc(options) {
  return new FrameReviewIpcBoundary(options).register();
}

module.exports = { CHANNELS, FrameReviewIpcBoundary, registerFrameReviewIpc };
