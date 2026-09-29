const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_RANGES = 500;

class ClipCapturesStore {
  constructor(userDataPath, fs = fsPromises) {
    if (!path.isAbsolute(userDataPath)) throw new Error('Capture store needs an absolute userData path.');
    this.directory = path.join(userDataPath, 'clip-captures');
    this.fs = fs;
    this.writers = new Map();
  }

  async lastActive() {
    let pointer;
    try {
      pointer = this.parse(await this.fs.readFile(path.join(this.directory, 'last-active.json'), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    if (pointer.schemaVersion !== 1) throw new Error('Saved last-movie pointer is unsupported.');
    const record = await this.load(pointer.movieFingerprint);
    if (!record) throw new Error('The last saved capture record is missing.');
    return record;
  }

  async load(fingerprint) {
    const key = this.key(fingerprint);
    const pending = this.writers.get(key)?.running;
    if (pending) await pending;
    let text;
    try {
      text = await this.fs.readFile(path.join(this.directory, `${key}.json`), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_RECORD_BYTES) throw new Error('Saved capture record exceeds the size limit.');
    const record = this.parse(text);
    this.validateRecord(record);
    if (this.key(record.movieFingerprint) !== key) throw new Error('Saved capture movie identity does not match its filename.');
    return record;
  }

  save({ fingerprint, displayName, sourcePath, data, markActive = false }) {
    const record = {
      schemaVersion: 1,
      movieFingerprint: this.fingerprint(fingerprint),
      displayName,
      lastKnownPath: sourcePath,
      nextRangeSequence: data?.nextRangeSequence,
      ...(data?.draft == null ? {} : { draft: data.draft }),
      ranges: data?.ranges,
    };
    this.validateRecord(record);
    const key = this.key(record.movieFingerprint);
    let writer = this.writers.get(key);
    if (!writer) {
      writer = { latest: null, waiters: [], running: null };
      this.writers.set(key, writer);
    }
    const completion = new Promise((resolve, reject) => writer.waiters.push({ resolve, reject }));
    writer.latest = { record, markActive: markActive || writer.latest?.markActive === true };
    if (!writer.running) writer.running = this.drain(key, writer);
    return completion;
  }

  async flush() {
    await Promise.all([...this.writers.values()].map(writer => writer.running).filter(Boolean));
  }

  async drain(key, writer) {
    try {
      while (writer.latest) {
        const { record, markActive } = writer.latest;
        const waiters = writer.waiters.splice(0);
        writer.latest = null;
        try {
          await this.write(key, record, markActive);
          for (const waiter of waiters) waiter.resolve();
        } catch (error) {
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    } finally {
      writer.running = null;
      this.writers.delete(key);
    }
  }

  async write(key, record, markActive) {
    await this.fs.mkdir(this.directory, { recursive: true });
    await this.replace(`${key}.json`, record);
    if (markActive) {
      await this.replace('last-active.json', { schemaVersion: 1, movieFingerprint: record.movieFingerprint });
    }
  }

  async replace(filename, value) {
    const destination = path.join(this.directory, filename);
    const temporary = path.join(this.directory, `.${filename}.${randomUUID()}.tmp`);
    try {
      await this.fs.writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
      await this.fs.rename(temporary, destination);
    } catch (error) {
      await this.fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  key(fingerprint) {
    return createHash('sha256').update(JSON.stringify(this.fingerprint(fingerprint))).digest('hex');
  }

  fingerprint(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.fingerprintVersion !== 1
      || !this.digest(value.sourceSampleDigest) || !this.digest(value.streamMetadataDigest)
      || !this.decimal(value.sourceBytes) || !this.decimal(value.sourceDurationUs)
      || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.signatureProfileVersion)
      || !Number.isSafeInteger(value.selectedStream) || value.selectedStream < 0) {
      throw new Error('Movie fingerprint is invalid.');
    }
    return {
      fingerprintVersion: 1,
      sourceSampleDigest: value.sourceSampleDigest,
      sourceBytes: value.sourceBytes,
      sourceDurationUs: value.sourceDurationUs,
      signatureProfileVersion: value.signatureProfileVersion,
      selectedStream: value.selectedStream,
      streamMetadataDigest: value.streamMetadataDigest,
    };
  }

  validateRecord(record) {
    if (!record || record.schemaVersion !== 1) throw new Error('Saved capture schema is unsupported.');
    this.fingerprint(record.movieFingerprint);
    if (typeof record.displayName !== 'string' || record.displayName.length < 1 || record.displayName.length > 512
      || typeof record.lastKnownPath !== 'string' || !path.isAbsolute(record.lastKnownPath)
      || !Number.isSafeInteger(record.nextRangeSequence) || record.nextRangeSequence < 1
      || !Array.isArray(record.ranges) || record.ranges.length > MAX_RANGES) {
      throw new Error('Saved capture record is invalid.');
    }
    if (record.draft !== undefined) {
      if (!record.draft || typeof record.draft !== 'object' || Array.isArray(record.draft)
        || (record.draft.start == null && record.draft.end == null)) {
        throw new Error('Saved capture draft is invalid.');
      }
      if (record.draft.start != null) this.endpoint(record.draft.start);
      if (record.draft.end != null) this.endpoint(record.draft.end);
    }
    const seen = new Set();
    let highest = 0;
    for (const range of record.ranges) {
      if (!range || typeof range.id !== 'string' || !/^range-[1-9]\d*$/.test(range.id) || seen.has(range.id)) {
        throw new Error('Saved range ID is invalid or duplicated.');
      }
      seen.add(range.id);
      highest = Math.max(highest, Number(range.id.slice(6)));
      this.endpoint(range.start);
      this.endpoint(range.end);
      if (range.start.kind === 'exact-frame' && range.end.kind === 'exact-frame') {
        if (range.end.frameIndex < range.start.frameIndex) throw new Error('Saved exact range is reversed.');
      } else if (BigInt(this.endpointPosition(range.end)) < BigInt(this.endpointPosition(range.start))) {
        throw new Error('Saved range time is reversed.');
      }
    }
    if (!Number.isSafeInteger(highest) || record.nextRangeSequence <= highest
      || Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_RECORD_BYTES) {
      throw new Error('Saved capture record exceeds its bounds.');
    }
  }

  endpoint(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved endpoint is invalid.');
    if (value.kind === 'exact-frame') {
      if (!Number.isSafeInteger(value.frameIndex) || value.frameIndex < 0
        || typeof value.frameInfoHash !== 'string' || !/^[a-f0-9]{16}$/.test(value.frameInfoHash)
        || !this.decimal(value.reviewTimeUs)) throw new Error('Saved exact endpoint is invalid.');
    } else if (value.kind === 'playback-timestamp') {
      if (!this.decimal(value.timestampUs)) throw new Error('Saved approximate endpoint is invalid.');
    } else {
      throw new Error('Saved endpoint kind is unsupported.');
    }
  }

  endpointPosition(value) {
    return value.kind === 'exact-frame' ? value.reviewTimeUs : value.timestampUs;
  }

  digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
  decimal(value) { return typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value); }
  parse(text) { return JSON.parse(text.replace(/^\uFEFF/, '')); }
}

module.exports = { ClipCapturesStore };
