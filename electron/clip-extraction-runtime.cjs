const fsPromises = require('node:fs/promises');
const { constants: { COPYFILE_EXCL } } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');

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

function runProcess(command, args, { cwd = process.cwd(), signal, env = process.env, spawnProcess = spawn } = {}) {
  return new Promise((resolve) => {
    const child = spawnProcess(command, args, {
      cwd,
      env,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', error => resolve({ ok: false, code: signal?.aborted ? 'cancelled' : 'process-failed', error, stdout, stderr }));
    child.once('close', exitCode => resolve({
      ok: exitCode === 0,
      code: exitCode === 0 ? 'completed' : signal?.aborted ? 'cancelled' : 'process-failed',
      exitCode,
      stdout,
      stderr,
    }));
  });
}

async function defaultProbeFrameTimes(ffprobe, sourcePath, selectedStream, startFrameIndex, endFrameIndex, {
  runCommand = runProcess,
  signal,
  environment = process.env,
} = {}) {
  const result = await runCommand(ffprobe, [
    '-v', 'error',
    '-select_streams', String(selectedStream),
    '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp_time,pkt_duration_time',
    '-of', 'json',
    sourcePath,
  ], { signal, env: environment });
  if (!result.ok) throw Object.assign(new Error('Could not inspect original-source frame times.'), { code: result.code });
  const document = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
  const frames = Array.isArray(document.frames) ? document.frames : [];
  const start = frames[startFrameIndex];
  const end = frames[endFrameIndex];
  const following = frames[endFrameIndex + 1];
  const secondsToUs = value => BigInt(Math.round(Number(value) * 1_000_000));
  if (!start || !end || !Number.isFinite(Number(start.best_effort_timestamp_time))
    || !Number.isFinite(Number(end.best_effort_timestamp_time))) {
    throw new Error('Original-source frame boundaries are unavailable.');
  }
  const startUs = secondsToUs(start.best_effort_timestamp_time);
  const endUs = following && Number.isFinite(Number(following.best_effort_timestamp_time))
    ? secondsToUs(following.best_effort_timestamp_time)
    : secondsToUs(end.best_effort_timestamp_time) + secondsToUs(end.pkt_duration_time || 0.04);
  if (endUs <= startUs) throw new Error('Original-source frame boundaries are invalid.');
  return { startUs, endUs };
}

async function defaultVerifyMedia(ffprobe, outputPath, { runCommand = runProcess, signal, environment = process.env } = {}) {
  const result = await runCommand(ffprobe, [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'json', outputPath,
  ], { signal, env: environment });
  if (!result.ok) throw new Error('Could not verify the extracted media.');
  const document = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
  if (!Array.isArray(document.streams) || !document.streams.some(stream => stream.codec_type === 'video')) {
    throw new Error('The extracted media has no video stream.');
  }
}

class ClipExtractionRuntime {
  constructor({
    fs = fsPromises,
    getSettings,
    resolveFfmpeg,
    resolveFfprobe,
    runCommand = runProcess,
    probeFrameTimes = defaultProbeFrameTimes,
    verifyMedia = defaultVerifyMedia,
    environment = process.env,
    randomId = () => randomBytes(18).toString('base64url'),
  } = {}) {
    if (typeof getSettings !== 'function' || typeof resolveFfmpeg !== 'function' || typeof resolveFfprobe !== 'function') {
      throw new Error('Clip-extraction runtime dependencies are invalid.');
    }
    this.fs = fs;
    this.getSettings = getSettings;
    this.resolveFfmpeg = resolveFfmpeg;
    this.resolveFfprobe = resolveFfprobe;
    this.runCommand = runCommand;
    this.probeFrameTimes = probeFrameTimes;
    this.verifyMedia = verifyMedia;
    this.environment = environment;
    this.randomId = randomId;
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
    return { ok: true, result: { destinationHandle: handle, folderName: 'extraction-tmp', entries } };
  }

  async allocateAndExtract(ownerId, host, request, signal) {
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
      source = await host.prepareExtractionSource(request.sourceHandle, signal);
    } catch (error) {
      return errorResult(error?.code === 'ABORT_ERR' ? 'cancelled' : 'invalid-source', 'The original source is unavailable.');
    }
    const ffmpeg = this.resolveFfmpeg();
    const ffprobe = this.resolveFfprobe();
    const workspace = await this.fs.mkdtemp(path.join(target.folderPath, '.clip-extraction-'));
    const videoPath = path.join(workspace, 'video.mp4');
    const mediaPath = path.join(workspace, 'media.mp4');
    try {
      const boundary = await this.probeFrameTimes(
        ffprobe, source.sourcePath, source.selectedStream, request.startFrameIndex, request.endFrameIndex,
        { runCommand: this.runCommand, signal, environment: this.environment });
      const videoResult = await this.runCommand(ffmpeg, [
        '-hide_banner', '-nostdin', '-y', '-noautorotate', '-i', source.sourcePath,
        '-map', `0:${source.selectedStream}`,
        '-vf', `select='between(n,${request.startFrameIndex},${request.endFrameIndex})',setpts=PTS-STARTPTS`,
        '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p', videoPath,
      ], { cwd: workspace, signal, env: this.environment });
      if (!videoResult.ok) return errorResult(videoResult.code, 'The selected frames could not be encoded.');
      const startSeconds = (Number(boundary.startUs) / 1_000_000).toFixed(6);
      const endSeconds = (Number(boundary.endUs) / 1_000_000).toFixed(6);
      const muxResult = await this.runCommand(ffmpeg, [
        '-hide_banner', '-nostdin', '-y', '-copyts', '-i', videoPath, '-i', source.sourcePath,
        '-map', '0:v:0', '-map', '1:a:0?', '-filter:a', `atrim=start=${startSeconds}:end=${endSeconds},asetpts=PTS-STARTPTS`,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mediaPath,
      ], { cwd: workspace, signal, env: this.environment });
      if (!muxResult.ok) return errorResult(muxResult.code, 'The extracted media could not be finalized.');
      await this.verifyMedia(ffprobe, mediaPath, {
        runCommand: this.runCommand, signal, environment: this.environment,
      });
      let sequence = 1;
      let filename;
      while (true) {
        filename = `${request.collectionName}-${String(sequence).padStart(3, '0')}.mp4`;
        try {
          await this.fs.copyFile(mediaPath, path.join(target.folderPath, filename), COPYFILE_EXCL);
          break;
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
          sequence += 1;
        }
      }
      const stat = await this.fs.stat(path.join(target.folderPath, filename));
      return {
        ok: true,
        result: {
          mediaHandle: `media_${this.randomId()}`,
          filename,
          entry: publicEntry(filename, stat, 'video/mp4'),
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

  extract(ownerId, host, request = {}) {
    const operationId = String(request.operationId || '');
    if (!/^extract_[a-zA-Z0-9_-]{8,120}$/.test(operationId) || this.operations.has(operationId)) {
      return Promise.resolve(errorResult('invalid-operation', 'The extraction operation is invalid.'));
    }
    const controller = new AbortController();
    this.operations.set(operationId, { ownerId, controller });
    const queueKey = `${ownerId}\n${request.destinationHandle}\n${request.collectionName}`;
    const previous = this.collectionQueues.get(queueKey) || Promise.resolve();
    const operation = previous.catch(() => undefined)
      .then(() => this.allocateAndExtract(ownerId, host, request, controller.signal))
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
