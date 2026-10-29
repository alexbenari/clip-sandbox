const fsPromises = require('node:fs/promises');
const { constants: { COPYFILE_EXCL } } = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { SourceInfo } = require('./clip-provenance/source-info.cjs');

const COLLECTION_NAME = /^[^<>:"/\\|?*\u0000]{1,180}$/;
const OPAQUE_ID = /^[a-zA-Z0-9_-]{8,128}$/;

function publicEntry(name, stat, type = '') {
  return Object.freeze({ name, type, size: stat.size, lastModifiedMs: stat.mtimeMs });
}

function errorResult(code, message = code) {
  return { ok: false, code, error: { message } };
}

function validCollectionName(value) {
  return typeof value === 'string'
    && value === value.trim()
    && COLLECTION_NAME.test(value)
    && value !== '.'
    && value !== '..'
    && !/[. ]$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}

function validTopLevelFilename(value, extension) {
  return validCollectionName(value)
    && path.basename(value) === value
    && value.toLowerCase().endsWith(extension);
}

class ClipExtractionRuntime {
  constructor({
    fs = fsPromises,
    getSettings,
    encoder,
    randomId = () => randomBytes(18).toString('base64url'),
    provenance = new Mp4Provenance(),
  } = {}) {
    if (typeof getSettings !== 'function' || typeof encoder?.encode !== 'function') {
      throw new Error('Clip-extraction runtime dependencies are invalid.');
    }
    this.fs = fs;
    this.getSettings = getSettings;
    this.randomId = randomId;
    this.provenance = provenance;
    this.encoder = encoder;
    this.destinations = new Map();
    this.operations = new Map();
    this.collectionQueues = new Map();
  }

  destination(ownerId, handle) {
    const resolved = this.destinations.get(handle);
    return resolved?.ownerId === ownerId ? resolved : null;
  }

  async openDestination(ownerId) {
    const settingsResult = await this.getSettings();
    const root = settingsResult?.ok === true ? settingsResult.settings?.pipelinesRootPath : null;
    if (typeof root !== 'string' || !path.isAbsolute(root)) {
      return errorResult('missing-pipeline-root', 'Choose a Pipelines root in Settings before extracting.');
    }
    const folderPath = path.join(path.resolve(root), 'extraction-tmp');
    await this.fs.mkdir(folderPath, { recursive: true });
    const handle = `destination_${this.randomId()}`;
    this.destinations.set(handle, { ownerId, folderPath });
    const entries = [];
    for (const dirent of await this.fs.readdir(folderPath, { withFileTypes: true })) {
      if (!dirent?.isFile?.()) continue;
      const name = String(dirent.name || '');
      const absolutePath = path.join(folderPath, name);
      const stat = await this.fs.stat(absolutePath);
      if (/\.txt$/i.test(name)) {
        entries.push({ ...publicEntry(name, stat, 'text/plain'), text: await this.fs.readFile(absolutePath, 'utf8') });
      } else if (/\.mp4$/i.test(name)) {
        entries.push(publicEntry(name, stat, 'video/mp4'));
      }
    }
    return { ok: true, result: { destinationHandle: handle, folderPath, folderName: path.basename(folderPath), entries } };
  }

  async allocateAndExtract(ownerId, host, request, signal, report = () => undefined) {
    const target = this.destination(ownerId, request.destinationHandle);
    if (!target) return errorResult('invalid-destination', 'The extraction destination is unavailable.');
    if (!OPAQUE_ID.test(String(request.sourceHandle || '').replace(/^source_/, ''))
      || !Number.isSafeInteger(request.sourceGeneration) || request.sourceGeneration < 1
      || !validCollectionName(request.collectionName)
      || !Number.isSafeInteger(request.startFrameIndex) || request.startFrameIndex < 0
      || !Number.isSafeInteger(request.endFrameIndex) || request.endFrameIndex < request.startFrameIndex) {
      return errorResult('invalid-request', 'The exact extraction request is invalid.');
    }
    let source;
    try {
      report({ stage: 'checking-source' });
      source = await host.prepareExtractionSource(request.sourceHandle, signal);
    } catch (error) {
      return errorResult(error?.code === 'ABORT_ERR' ? 'cancelled' : 'invalid-source', 'The original source is unavailable.');
    }
    const workspace = await this.fs.mkdtemp(path.join(target.folderPath, '.clip-extraction-'));
    try {
      const provenance = await this.prepareProvenance(host, request, source);
      if (!provenance.ok) return provenance;
      const { reviewSessionId, sourceHandle, startFrameIndex, endFrameIndex } = request;
      const encoded = await this.encoder.encode({
        host, source, range: { reviewSessionId, sourceHandle, startFrameIndex, endFrameIndex },
        tagValue: provenance.serializedProvenance, workspace, signal, report,
      });
      if (signal.aborted) return errorResult('cancelled', 'Extraction was cancelled.');
      if (!encoded.ok) return encoded;
      report({ stage: 'saving-media' });
      const { filename, stat } = await this.publishMedia(target, request.collectionName, encoded.mediaPath);
      return {
        ok: true,
        result: {
          mediaHandle: `media_${this.randomId()}`,
          filename,
          entry: publicEntry(filename, stat, 'video/mp4'),
          warning: encoded.warning ?? provenance.warning,
        },
      };
    } catch (error) {
      return errorResult(signal.aborted ? 'cancelled' : 'extraction-failed', error instanceof Error ? error.message : 'Extraction failed.');
    } finally {
      try {
        await this.fs.rm(workspace, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('[clip-extraction] operation-temp-cleanup-failed', {
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
  }

  async prepareProvenance(host, request, source) {
    if (!request.reviewSessionId) return { ok: true, serializedProvenance: null, warning: undefined };
    let endpoints;
    try {
      endpoints = await host.extractionFrameIdentities(
        request.reviewSessionId, request.sourceHandle, request.startFrameIndex, request.endFrameIndex,
        source.identity);
    } catch {
      return errorResult('invalid-source', 'Exact frame identity could not be verified for extraction.');
    }
    const [start, end] = endpoints;
    if (start.frameIndex !== request.startFrameIndex || end.frameIndex !== request.endFrameIndex
      || start.originalFrameIndex !== request.startFrameIndex
      || end.originalFrameIndex !== request.endFrameIndex) {
      return errorResult('invalid-source', 'Exact frame ordinals changed before extraction.');
    }
    try {
      const sourceInfo = SourceInfo.forMovieRange(
        SourceInfo.movieOf(source.sourcePath, source.identity),
        { start: start.frameIndex, end: end.frameIndex, startTimeUs: SourceInfo.timeUsOf(start), endTimeUs: SourceInfo.timeUsOf(end) },
        [start, end],
      );
      return { ok: true, serializedProvenance: this.provenance.tagValueOf(sourceInfo), warning: undefined };
    } catch {
      return {
        ok: true, serializedProvenance: null,
        warning: 'Clip saved without source metadata; the metadata record was unavailable.',
      };
    }
  }

  async publishMedia(target, collectionName, mediaPath) {
    let sequence = 1;
    let filename;
    while (true) {
      filename = `${collectionName}-${String(sequence).padStart(3, '0')}.mp4`;
      try {
        await this.fs.copyFile(mediaPath, path.join(target.folderPath, filename), COPYFILE_EXCL);
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        sequence += 1;
      }
    }
    const stat = await this.fs.stat(path.join(target.folderPath, filename));
    return { filename, stat };
  }

  extract(ownerId, host, request = {}, report = () => undefined) {
    const operationId = String(request.operationId || '');
    if (!/^extract_[a-zA-Z0-9_-]{8,120}$/.test(operationId) || this.operations.has(operationId)) {
      return Promise.resolve(errorResult('invalid-operation', 'The extraction operation is invalid.'));
    }
    const controller = new AbortController();
    this.operations.set(operationId, { ownerId, controller });
    const queueKey = `${ownerId}\n${request.destinationHandle}\n${request.collectionName}`;
    const previous = this.collectionQueues.get(queueKey) || Promise.resolve();
    const operation = previous.catch(() => undefined)
      .then(() => this.allocateAndExtract(ownerId, host, request, controller.signal, report))
      .finally(() => {
        this.operations.delete(operationId);
        if (this.collectionQueues.get(queueKey) === operation) this.collectionQueues.delete(queueKey);
      });
    this.collectionQueues.set(queueKey, operation);
    return operation;
  }

  async saveCollection(ownerId, request = {}) {
    const target = this.destination(ownerId, request.destinationHandle);
    if (!target) return errorResult('invalid-destination', 'The extraction destination is unavailable.');
    if (!validTopLevelFilename(request.filename, '.txt') || typeof request.text !== 'string'
      || Buffer.byteLength(request.text, 'utf8') > 4 * 1024 * 1024
      || request.text.split(/\r?\n/).filter(Boolean).some(name => !validTopLevelFilename(name, '.mp4'))) {
      return errorResult('invalid-request', 'The collection publication request is invalid.');
    }
    const temporary = path.join(target.folderPath, `.${request.filename}.${this.randomId()}.tmp`);
    try {
      await this.fs.writeFile(temporary, request.text, { encoding: 'utf8', flag: 'wx' });
      await this.fs.rename(temporary, path.join(target.folderPath, request.filename));
      return { ok: true, result: null };
    } catch (error) {
      try {
        await this.fs.unlink(temporary);
      } catch (cleanupError) {
        console.warn('[clip-extraction] publication-temp-cleanup-failed', {
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      return errorResult('publication-failed', error instanceof Error ? error.message : 'Collection publication failed.');
    }
  }

  async cancel(ownerId, operationId) {
    const operation = this.operations.get(operationId);
    if (!operation || operation.ownerId !== ownerId) return errorResult('invalid-operation', 'The extraction operation is unavailable.');
    operation.controller.abort();
    return { ok: true, result: null };
  }

  async dispose() {
    for (const operation of this.operations.values()) operation.controller.abort();
    await Promise.allSettled([...this.collectionQueues.values()]);
    this.destinations.clear();
  }
}

function createClipExtractionRuntime(options = {}) {
  return new ClipExtractionRuntime(options);
}

module.exports = {
  createClipExtractionRuntime,
};
