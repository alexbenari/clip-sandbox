const fsPromises = require('node:fs/promises');
const { constants: { COPYFILE_EXCL } } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
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

function runProcess(command, args, { cwd = process.cwd(), signal, env = process.env,
  spawnProcess = spawn, onProgress } = {}) {
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
    let progressBuffer = '';
    let processError = null;
    let outputTooLarge = false;
    child.stdout?.on('data', chunk => {
      if (!onProgress) {
        if (stdout.length + chunk.length > 128 * 1024 * 1024) {
          if (!outputTooLarge) child.kill();
          outputTooLarge = true;
          return;
        }
        stdout += chunk.toString();
        return;
      }
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop().slice(-1024);
      for (const line of lines) {
        const match = /^frame=(\d+)$/.exec(line.trim());
        if (match) onProgress(Number(match[1]));
      }
    });
    child.stderr?.on('data', chunk => { stderr = `${stderr}${chunk.toString()}`.slice(-8 * 1024 * 1024); });
    child.once('error', error => { processError = error; });
    child.once('close', exitCode => resolve({
      ok: exitCode === 0 && !processError && !signal?.aborted && !outputTooLarge,
      code: outputTooLarge ? 'process-output-too-large' : signal?.aborted ? 'cancelled'
        : exitCode === 0 && !processError ? 'completed' : 'process-failed',
      exitCode,
      error: processError,
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

async function defaultVerifyMedia(ffprobe, outputPath, { runCommand = runProcess, signal, environment = process.env,
  expectedFrames } = {}) {
  const result = await runCommand(ffprobe, [
    '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames',
    '-of', 'json', outputPath,
  ], { signal, env: environment });
  if (!result.ok) throw new Error('Could not verify the extracted media.');
  const document = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
  const video = Array.isArray(document.streams) && document.streams.find(stream => stream.codec_type === 'video');
  if (!video) {
    throw new Error('The extracted media has no video stream.');
  }
  if (expectedFrames !== undefined && Number(video.nb_read_frames) !== expectedFrames) {
    throw new Error('The extracted media has the wrong number of frames.');
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
    provenance = new Mp4Provenance(),
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
    this.provenance = provenance;
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
    const ffmpeg = this.resolveFfmpeg();
    const ffprobe = this.resolveFfprobe();
    const workspace = await this.fs.mkdtemp(path.join(target.folderPath, '.clip-extraction-'));
    const videoPath = path.join(workspace, 'video.mp4');
    const mediaPath = path.join(workspace, 'media.mp4');
    try {
      let boundary = await this.indexedBoundary(host, source, request, signal);
      report({ stage: boundary ? 'encoding-video' : 'exact-fallback' });
      let videoResult = boundary
        ? await this.encodeIndexedVideo({ ffmpeg, source, request, workspace, videoPath, boundary, signal, report })
        : null;
      if (signal.aborted) return errorResult('cancelled', 'Extraction was cancelled.');
      if (!videoResult?.ok) {
        console.info('[clip-extraction] exact-fallback', { reason: boundary ? videoResult?.code : 'index-unavailable' });
        report({ stage: 'exact-fallback' });
        boundary = await this.probeFrameTimes(
          ffprobe, source.sourcePath, source.selectedStream, request.startFrameIndex, request.endFrameIndex,
          { runCommand: this.runCommand, signal, environment: this.environment });
        videoResult = await this.encodeVideo({ ffmpeg, source, request, workspace, videoPath, signal, report });
      }
      if (!videoResult.ok) return errorResult(videoResult.code, 'The selected frames could not be encoded.');
      report({ stage: 'adding-audio' });
      let finalization;
      try {
        finalization = await this.finalizeMedia({
          host, request, source, ffmpeg, ffprobe, workspace, videoPath, mediaPath, boundary, signal,
        });
      } catch (error) {
        if (!boundary?.frames || signal.aborted) throw error;
        finalization = errorResult('unverified-media', 'The locally extracted media could not be verified.');
      }
      if (!finalization.ok && boundary?.frames && !signal.aborted) {
        report({ stage: 'exact-fallback' });
        await Promise.all([this.fs.rm(videoPath, { force: true }), this.fs.rm(mediaPath, { force: true })]);
        boundary = await this.probeFrameTimes(
          ffprobe, source.sourcePath, source.selectedStream, request.startFrameIndex, request.endFrameIndex,
          { runCommand: this.runCommand, signal, environment: this.environment });
        const fallbackVideo = await this.encodeVideo({ ffmpeg, source, request, workspace, videoPath, signal, report });
        if (!fallbackVideo.ok) return errorResult(fallbackVideo.code, 'The selected frames could not be encoded.');
        report({ stage: 'adding-audio' });
        finalization = await this.finalizeMedia({
          host, request, source, ffmpeg, ffprobe, workspace, videoPath, mediaPath, boundary, signal,
        });
      }
      if (!finalization.ok) return finalization;
      if (signal.aborted) return errorResult('cancelled', 'Extraction was cancelled.');
      report({ stage: 'saving-media' });
      const { filename, stat } = await this.publishMedia(target, request.collectionName, mediaPath);
      return {
        ok: true,
        result: {
          mediaHandle: `media_${this.randomId()}`,
          filename,
          entry: publicEntry(filename, stat, 'video/mp4'),
          warning: finalization.warning,
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

  async indexedBoundary(host, source, request, signal) {
    if (source.normalizedSourcePath !== null || source.canonicalSourcePath !== source.sourcePath
      || !request.reviewSessionId || !Number.isSafeInteger(source.frameCount)
      || typeof host.extractionFrameTimeline !== 'function'
      || request.endFrameIndex - request.startFrameIndex > 4_999) return null;
    let frames;
    try {
      frames = await host.extractionFrameTimeline(
        request.reviewSessionId, request.sourceHandle, request.startFrameIndex,
        Math.min(source.frameCount - 1, request.endFrameIndex + 1), source.identity);
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
    const expectedCount = request.endFrameIndex - request.startFrameIndex + 1;
    if (!Array.isArray(frames) || frames.length < expectedCount || frames.length > expectedCount + 1) return null;
    const first = frames[0];
    const numerator = first?.timebaseNumerator;
    const denominator = first?.timebaseDenominator;
    if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || numerator <= 0n || denominator <= 0n) return null;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      if (frame.frameIndex !== request.startFrameIndex + index
        || frame.originalFrameIndex !== frame.frameIndex
        || frame.timebaseNumerator !== numerator || frame.timebaseDenominator !== denominator
        || typeof frame.pts !== 'bigint' || (index > 0 && frame.pts <= frames[index - 1].pts)) return null;
    }
    const final = frames[expectedCount - 1];
    const endPts = frames[expectedCount]?.pts ?? final.pts + final.duration;
    if (typeof endPts !== 'bigint' || endPts <= final.pts) return null;
    if (first.pts > BigInt(Number.MAX_SAFE_INTEGER) || endPts > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    const seconds = pts => Number(pts * numerator) / Number(denominator);
    const startSeconds = seconds(first.pts);
    const endSeconds = seconds(endPts);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0
      || endSeconds <= startSeconds || endSeconds - startSeconds > 60 * 60) return null;
    return {
      startUs: first.pts * numerator * 1_000_000n / denominator,
      endUs: endPts * numerator * 1_000_000n / denominator,
      startSeconds, endSeconds, startPts: first.pts, endPts, frames, numerator, denominator,
    };
  }

  async encodeIndexedVideo({ ffmpeg, source, request, workspace, videoPath, boundary, signal, report }) {
    const seek = Math.max(0, boundary.startSeconds - 5);
    const readDuration = boundary.endSeconds - seek + 2;
    const count = request.endFrameIndex - request.startFrameIndex + 1;
    const result = await this.runCommand(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-stats_period', '0.5', '-noautorotate',
      '-ss', seek.toFixed(6), '-t', readDuration.toFixed(6), '-copyts', '-i', source.sourcePath,
      '-map', `0:${source.selectedStream}`,
      '-vf', `select='gte(pts,${boundary.startPts})*lt(pts,${boundary.endPts})',showinfo,setpts=PTS-STARTPTS`,
      '-frames:v', String(count), '-fps_mode', 'passthrough', '-an',
      '-c:v', 'libx264', '-crf', '16', '-maxrate', '48M', '-bufsize', '96M', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', videoPath,
    ], { cwd: workspace, signal, env: this.environment,
      onProgress: frame => report({ stage: 'encoding-video', encodedFrames: Math.min(count, frame), totalFrames: count }) });
    if (!result.ok) return result;
    const timebase = /Parsed_showinfo[^\r\n]*config in time_base:\s*(\d+)\/(\d+)/.exec(result.stderr || '');
    const selected = [...String(result.stderr || '').matchAll(/Parsed_showinfo[^\r\n]*\bn:\s*\d+\s+pts:\s*(-?\d+)/g)];
    if (!timebase || selected.length < count || selected.length > count + 1) {
      console.warn('[clip-extraction] local-frame-check', { expected: count, selected: selected.length, hasTimebase: !!timebase });
      return errorResult('unverified-seek', 'The seeked frames could not be verified.');
    }
    const outputNumerator = BigInt(timebase[1]);
    const outputDenominator = BigInt(timebase[2]);
    if (outputNumerator <= 0n || outputDenominator <= 0n) return errorResult('unverified-seek');
    for (let index = 0; index < count; index += 1) {
      const actual = BigInt(selected[index][1]);
      const expected = boundary.frames[index].pts;
      if (actual * outputNumerator * boundary.denominator
        !== expected * boundary.numerator * outputDenominator) {
        console.warn('[clip-extraction] local-frame-check', { mismatchAt: index, expectedPts: String(expected), actualPts: String(actual) });
        return errorResult('unverified-seek', 'The seeked frames do not match the original index.');
      }
    }
    report({ stage: 'encoding-video', encodedFrames: count, totalFrames: count });
    return result;
  }

  async encodeVideo({ ffmpeg, source, request, workspace, videoPath, signal, report = () => undefined }) {
    const count = request.endFrameIndex - request.startFrameIndex + 1;
    const result = await this.runCommand(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-stats_period', '0.5', '-noautorotate', '-i', source.sourcePath,
      '-map', `0:${source.selectedStream}`,
      '-vf', `select='between(n,${request.startFrameIndex},${request.endFrameIndex})',setpts=PTS-STARTPTS`,
      '-frames:v', String(count), '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-crf', '16', '-maxrate', '48M', '-bufsize', '96M', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', videoPath,
    ], { cwd: workspace, signal, env: this.environment,
      onProgress: frame => report({ stage: 'encoding-video', encodedFrames: Math.min(count, frame), totalFrames: count }) });
    if (result.ok) report({ stage: 'encoding-video', encodedFrames: count, totalFrames: count });
    return result;
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

  async finalizeMedia({ host, request, source, ffmpeg, ffprobe, workspace, videoPath, mediaPath, boundary, signal }) {
    const provenance = await this.prepareProvenance(host, request, source);
    if (!provenance.ok) return provenance;
    let { serializedProvenance, warning } = provenance;
    const startSeconds = (Number(boundary.startUs) / 1_000_000).toFixed(6);
    const endSeconds = (Number(boundary.endUs) / 1_000_000).toFixed(6);
    const audioSeek = boundary.startSeconds === undefined ? []
      : ['-ss', Math.max(0, boundary.startSeconds - 5).toFixed(6)];
    const muxBase = [
      '-hide_banner', '-nostdin', '-y', '-copyts', '-i', videoPath, ...audioSeek, '-i', source.sourcePath,
      '-map', '0:v:0', '-map', '1:a:0?', '-filter:a', `atrim=start=${startSeconds}:end=${endSeconds},asetpts=PTS-STARTPTS`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    ];
    let muxResult = await this.runCommand(ffmpeg, [
      ...muxBase,
      ...(serializedProvenance ? this.provenance.muxArguments(serializedProvenance) : ['-movflags', '+faststart']),
      mediaPath,
    ], { cwd: workspace, signal, env: this.environment });
    if (!muxResult.ok && serializedProvenance && !signal.aborted) {
      warning = 'Clip saved without source metadata; the metadata writer failed.';
      serializedProvenance = null;
      muxResult = await this.runCommand(ffmpeg, [
        ...muxBase, '-movflags', '+faststart', mediaPath,
      ], { cwd: workspace, signal, env: this.environment });
    }
    if (!muxResult.ok) return errorResult(muxResult.code, 'The extracted media could not be finalized.');
    await this.verifyMedia(ffprobe, mediaPath, {
      runCommand: this.runCommand, signal, environment: this.environment,
      expectedFrames: request.endFrameIndex - request.startFrameIndex + 1,
    });
    if (serializedProvenance) {
      try {
        const readBack = await this.provenance.readBack(mediaPath);
        if (readBack !== serializedProvenance) throw new Error('Clip provenance readback differs from the written record.');
      } catch {
        warning = 'Clip saved, but its source metadata could not be verified.';
      }
    }
    return { ok: true, warning };
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
