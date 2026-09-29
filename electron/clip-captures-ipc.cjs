const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const CHANNELS = Object.freeze({
  last: 'clip-sandbox:clip-captures-last',
  attach: 'clip-sandbox:clip-captures-attach',
  save: 'clip-sandbox:clip-captures-save',
});

class ClipCapturesIpcBoundary {
  constructor({ ipcMain, store, hostForEvent }) {
    if (!ipcMain?.handle || !store || typeof hostForEvent !== 'function') {
      throw new Error('Clip-captures IPC dependencies are invalid.');
    }
    this.ipcMain = ipcMain;
    this.store = store;
    this.hostForEvent = hostForEvent;
    this.contexts = new Map();
    this.attachQueues = new Map();
  }

  register() {
    this.ipcMain.handle(CHANNELS.last, (event) => this.last(event));
    this.ipcMain.handle(CHANNELS.attach, (event, payload) => this.attach(event, payload));
    this.ipcMain.handle(CHANNELS.save, (event, payload) => this.save(event, payload));
    return () => Object.values(CHANNELS).forEach(channel => this.ipcMain.removeHandler(channel));
  }

  async last(event) {
    try {
      const record = await this.store.lastActive();
      if (!record) return { ok: true, result: null };
      try {
        const info = await fs.stat(record.lastKnownPath);
        if (!info.isFile()) throw new Error('Saved movie is not a file.');
      } catch {
        const movieRef = this.grant(event, record);
        return { ok: true, result: {
          name: record.displayName, unavailable: true, movieRef,
          data: { schemaVersion: 1, nextRangeSequence: record.nextRangeSequence,
            ...(record.draft ? { draft: record.draft } : {}), ranges: record.ranges },
        } };
      }
      const sourceHandle = this.hostForEvent(event).registerSource(record.lastKnownPath);
      return {
        ok: true,
        result: { name: record.displayName, sourceHandle, expectedFingerprint: record.movieFingerprint },
      };
    } catch (error) {
      return this.failure(error);
    }
  }

  async attach(event, payload) {
    const ownerId = event.sender.id;
    const previous = this.attachQueues.get(ownerId) || Promise.resolve();
    const operation = previous.then(() => this.attachOne(event, payload));
    this.attachQueues.set(ownerId, operation);
    try {
      return await operation;
    } finally {
      if (this.attachQueues.get(ownerId) === operation) this.attachQueues.delete(ownerId);
    }
  }

  async attachOne(event, payload) {
    try {
      const context = this.context(event, payload);
      if (payload?.expectedFingerprint
        && this.store.key(payload.expectedFingerprint) !== this.store.key(context.fingerprint)) {
        const saved = await this.store.load(payload.expectedFingerprint);
        return { ok: true, result: {
          stale: true,
          ...(saved ? { movieRef: this.grant(event, saved) } : {}),
          data: saved ? { schemaVersion: 1, nextRangeSequence: saved.nextRangeSequence,
            ...(saved.draft ? { draft: saved.draft } : {}), ranges: saved.ranges } : null,
        } };
      }
      let record = await this.store.load(context.fingerprint);
      if (!record) {
        await this.store.save({
          fingerprint: context.fingerprint,
          displayName: path.basename(context.sourcePath),
          sourcePath: context.sourcePath,
          data: { nextRangeSequence: 1, ranges: [] },
          markActive: true,
        });
        record = await this.store.load(context.fingerprint);
      } else {
        await this.store.save({
          fingerprint: context.fingerprint,
          displayName: path.basename(context.sourcePath),
          sourcePath: context.sourcePath,
          data: { nextRangeSequence: record.nextRangeSequence, draft: record.draft, ranges: record.ranges },
          markActive: true,
        });
      }
      const movieRef = this.grant(event, {
        movieFingerprint: context.fingerprint,
        displayName: path.basename(context.sourcePath),
        lastKnownPath: context.sourcePath,
      });
      return {
        ok: true,
        result: {
          movieRef,
          fingerprint: context.fingerprint,
          data: { schemaVersion: 1, nextRangeSequence: record.nextRangeSequence,
            ...(record.draft ? { draft: record.draft } : {}), ranges: record.ranges },
        },
      };
    } catch (error) {
      return this.failure(error);
    }
  }

  async save(event, payload) {
    try {
      const grant = this.contexts.get(payload?.movieRef);
      if (!grant || grant.ownerId !== event.sender.id) throw new Error('Saved movie reference is unavailable.');
      await this.store.save({
        fingerprint: grant.fingerprint,
        displayName: grant.displayName,
        sourcePath: grant.sourcePath,
        data: payload?.data,
      });
      return { ok: true, result: null };
    } catch (error) {
      return this.failure(error);
    }
  }

  context(event, payload) {
    if (typeof payload?.sessionId !== 'string' || !/^session_[a-zA-Z0-9_-]{8,120}$/.test(payload.sessionId)) {
      throw new Error('Capture session id is invalid.');
    }
    return this.hostForEvent(event).captureContext(payload.sessionId);
  }

  grant(event, record) {
    const movieRef = `capture_${randomBytes(18).toString('base64url')}`;
    this.contexts.set(movieRef, {
      ownerId: event.sender.id,
      fingerprint: record.movieFingerprint,
      displayName: record.displayName,
      sourcePath: record.lastKnownPath,
    });
    return movieRef;
  }

  failure(error) {
    return {
      ok: false,
      error: { message: error instanceof Error ? error.message.slice(0, 1024) : 'Saved captures are unavailable.' },
    };
  }
}

function registerClipCapturesIpc(options) {
  return new ClipCapturesIpcBoundary(options).register();
}

module.exports = { CHANNELS, ClipCapturesIpcBoundary, registerClipCapturesIpc };
