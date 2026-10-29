const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { runProcess } = require('./process-runner.cjs');

const SCHEMA_VERSION = 1;
const WINDOW_FILE = 'window.mkv';
const MANIFEST_FILE = 'manifest.json';
const MICROSECONDS_PER_SECOND = 1_000_000;

// A window is a short stretch of a source movie copied out without re-encoding, so that only the window
// is prepared for exact frames.
class MovieWindowCache {
  constructor({
    folder,
    resolveFfmpeg,
    environment,
    forgetPreparedReview,
    maxWindows = 10,
    runCommand = runProcess,
    fileSystem = fsPromises,
    now = () => Date.now(),
    randomId = () => randomBytes(9).toString('base64url'),
  }) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || typeof resolveFfmpeg !== 'function'
      || typeof forgetPreparedReview !== 'function' || !Number.isSafeInteger(maxWindows) || maxWindows < 1) {
      throw new Error('Movie window cache dependencies are invalid.');
    }
    this.folder = folder;
    this.resolveFfmpeg = resolveFfmpeg;
    this.environment = environment;
    this.forgetPreparedReview = forgetPreparedReview;
    this.maxWindows = maxWindows;
    this.runCommand = runCommand;
    this.fs = fileSystem;
    this.now = now;
    this.randomId = randomId;
    this.cuts = new Map();
    this.eviction = Promise.resolve();
  }

  async window(request, signal = new AbortController().signal) {
    const placement = this.#placement(request);
    signal.throwIfAborted();
    if (!this.cuts.has(placement.key)) {
      const windowPath = await this.#reusedWindow(placement);
      if (windowPath) return { windowPath, cacheHit: true };
    }
    return { windowPath: await this.#sharedCut(placement, signal), cacheHit: false };
  }

  #placement({ moviePath, sourceMovie, startUs, durationUs } = {}) {
    const fingerprint = sourceMovie?.fingerprint;
    if (typeof moviePath !== 'string' || !path.isAbsolute(moviePath)
      || !Number.isSafeInteger(startUs) || startUs < 0 || !Number.isSafeInteger(durationUs) || durationUs <= 0
      || !Number.isSafeInteger(fingerprint?.selectedStream) || fingerprint.selectedStream < 0) {
      throw new Error('The movie window request is invalid.');
    }
    const identity = { fingerprint: this.#canonicalFingerprint(fingerprint), startUs, durationUs };
    return { ...identity, moviePath, key: this.#key(identity) };
  }

  #canonicalFingerprint(fingerprint) {
    return {
      fingerprintVersion: fingerprint.fingerprintVersion,
      sourceSampleDigest: fingerprint.sourceSampleDigest,
      sourceBytes: fingerprint.sourceBytes,
      sourceDurationUs: fingerprint.sourceDurationUs,
      signatureProfileVersion: fingerprint.signatureProfileVersion,
      selectedStream: fingerprint.selectedStream,
      streamMetadataDigest: fingerprint.streamMetadataDigest,
    };
  }

  #key({ fingerprint, startUs, durationUs }) {
    const identity = { fingerprint: this.#canonicalFingerprint(fingerprint), startUs, durationUs };
    return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }

  async #reusedWindow(placement) {
    const manifest = await this.#manifest(placement.key);
    if (!manifest) return null;
    const windowPath = this.#windowPath(placement.key);
    try {
      const stat = await this.fs.stat(windowPath);
      if (!stat.isFile() || stat.size !== manifest.bytes) return null;
    } catch {
      return null;
    }
    await this.#writeManifest(placement.key, { ...manifest, lastUsedMs: this.now() });
    return windowPath;
  }

  async #manifest(key) {
    let manifest;
    try {
      manifest = JSON.parse(await this.fs.readFile(path.join(this.folder, key, MANIFEST_FILE), 'utf8'));
    } catch {
      return null;
    }
    const valid = manifest?.schemaVersion === SCHEMA_VERSION && manifest.key === key
      && manifest.fingerprint && typeof manifest.fingerprint === 'object'
      && Number.isSafeInteger(manifest.startUs) && Number.isSafeInteger(manifest.durationUs)
      && this.#key(manifest) === key
      && Number.isSafeInteger(manifest.bytes) && manifest.bytes >= 0 && Number.isFinite(manifest.lastUsedMs);
    return valid ? manifest : null;
  }

  async #writeManifest(key, manifest) {
    const temporary = path.join(this.folder, key, `.manifest-${this.randomId()}.json`);
    try {
      await this.fs.writeFile(temporary, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx' });
      await this.fs.rename(temporary, path.join(this.folder, key, MANIFEST_FILE));
    } catch (error) {
      await this.fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  #windowPath(key) {
    return path.join(this.folder, key, WINDOW_FILE);
  }

  // Callers asking for the same window share one cut, which stops only when every one of them gives up.
  #sharedCut(placement, signal) {
    let cut = this.cuts.get(placement.key);
    if (!cut) {
      const controller = new AbortController();
      cut = { controller, waiting: 0, done: null };
      cut.done = this.#cutAndEvict(placement, controller.signal).finally(() => this.cuts.delete(placement.key));
      this.cuts.set(placement.key, cut);
    }
    cut.waiting += 1;
    return new Promise((resolve, reject) => {
      const abandon = () => {
        cut.waiting -= 1;
        const lastWaiter = cut.waiting === 0;
        if (lastWaiter) cut.controller.abort(signal.reason);
        (lastWaiter ? cut.done : Promise.resolve()).then(() => reject(signal.reason), () => reject(signal.reason));
      };
      signal.addEventListener('abort', abandon, { once: true });
      cut.done.then(
        windowPath => { if (!signal.aborted) resolve(windowPath); },
        error => { if (!signal.aborted) reject(error); },
      ).finally(() => signal.removeEventListener('abort', abandon));
    });
  }

  async #cutAndEvict(placement, signal) {
    const windowPath = await this.#cut(placement, signal);
    await this.#evictBeyondLimit(placement.key);
    return windowPath;
  }

  async #cut({ moviePath, fingerprint, startUs, durationUs, key }, signal) {
    const directory = path.join(this.folder, key);
    try {
      await this.fs.rm(directory, { recursive: true, force: true });
      await this.fs.mkdir(directory, { recursive: true });
      const temporary = path.join(directory, `.window-${this.randomId()}.mkv`);
      const result = await this.runCommand(this.resolveFfmpeg(), [
        '-hide_banner', '-nostdin', '-y',
        '-ss', this.#seconds(startUs), '-t', this.#seconds(durationUs),
        '-i', moviePath,
        '-map', `0:${fingerprint.selectedStream}`, '-map', '0:a:0?',
        '-c', 'copy', '-f', 'matroska', temporary,
      ], { signal, env: this.environment });
      signal.throwIfAborted();
      if (!result.ok) throw new Error(`Cutting the movie window failed (${result.code}).`);
      const windowPath = this.#windowPath(key);
      await this.fs.rename(temporary, windowPath);
      const { size } = await this.fs.stat(windowPath);
      await this.#writeManifest(key, {
        schemaVersion: SCHEMA_VERSION, key, fingerprint, startUs, durationUs, bytes: size, lastUsedMs: this.now(),
      });
      return windowPath;
    } catch (error) {
      await this.fs.rm(directory, { recursive: true, force: true }).catch(cleanupError => {
        console.warn('[movie-window-cache] cut-cleanup-failed', { kind: this.#errorKind(cleanupError) });
      });
      throw error;
    }
  }

  #seconds(microseconds) {
    const whole = Math.floor(microseconds / MICROSECONDS_PER_SECOND);
    const fraction = String(microseconds % MICROSECONDS_PER_SECOND).padStart(6, '0');
    return `${whole}.${fraction}`;
  }

  #evictBeyondLimit(keptKey) {
    this.eviction = this.eviction.then(() => this.#evict(keptKey)).catch(error => {
      console.warn('[movie-window-cache] eviction-failed', { kind: this.#errorKind(error) });
    });
    return this.eviction;
  }

  async #evict(keptKey) {
    const windows = [];
    for (const entry of await this.fs.readdir(this.folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || (this.cuts.has(entry.name) && entry.name !== keptKey)) continue;
      const manifest = await this.#manifest(entry.name);
      if (manifest) windows.push(manifest);
      else await this.fs.rm(path.join(this.folder, entry.name), { recursive: true, force: true });
    }
    windows.sort((first, second) => second.lastUsedMs - first.lastUsedMs);
    for (const { key } of windows.slice(this.maxWindows)) {
      if (key === keptKey || this.cuts.has(key)) continue;
      try {
        await this.forgetPreparedReview(this.#windowPath(key));
      } catch (error) {
        console.warn('[movie-window-cache] forget-prepared-review-failed', { kind: this.#errorKind(error) });
      }
      await this.fs.rm(path.join(this.folder, key), { recursive: true, force: true });
    }
  }

  #errorKind(error) {
    return error instanceof Error ? error.name : 'unknown';
  }
}

module.exports = { MovieWindowCache };
