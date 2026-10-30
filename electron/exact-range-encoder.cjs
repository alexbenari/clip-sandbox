const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { runProcess } = require('./process-runner.cjs');
const { FrameTime } = require('./frame-time.cjs');
const { ForwardThenBackwardFilter } = require('./forward-then-backward-filter.cjs');

function errorResult(code, message = code) {
  return { ok: false, code, error: { message } };
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
  if (!result.ok) throw new Error('Could not verify the encoded media.');
  const document = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
  const video = Array.isArray(document.streams) && document.streams.find(stream => stream.codec_type === 'video');
  if (!video) {
    throw new Error('The encoded media has no video stream.');
  }
  if (expectedFrames !== undefined && Number(video.nb_read_frames) !== expectedFrames) {
    throw new Error('The encoded media has the wrong number of frames.');
  }
}

class ExactRangeEncoder {
  #fs;
  #resolveFfmpeg;
  #resolveFfprobe;
  #runCommand;
  #probeFrameTimes;
  #verifyMedia;
  #environment;
  #provenance;

  constructor({
    fs = fsPromises,
    resolveFfmpeg,
    resolveFfprobe,
    runCommand = runProcess,
    probeFrameTimes = defaultProbeFrameTimes,
    verifyMedia = defaultVerifyMedia,
    environment = process.env,
    provenance = new Mp4Provenance(),
  } = {}) {
    if (typeof resolveFfmpeg !== 'function' || typeof resolveFfprobe !== 'function') {
      throw new Error('Exact-range encoder dependencies are invalid.');
    }
    this.#fs = fs;
    this.#resolveFfmpeg = resolveFfmpeg;
    this.#resolveFfprobe = resolveFfprobe;
    this.#runCommand = runCommand;
    this.#probeFrameTimes = probeFrameTimes;
    this.#verifyMedia = verifyMedia;
    this.#environment = environment;
    this.#provenance = provenance;
  }

  async encode({ host, source, range, tagValue, workspace, signal, report = () => undefined,
    audio = true, forwardThenBackward = false }) {
    if (forwardThenBackward && audio) throw new Error('A forward-then-backward clip has no sound.');
    const job = {
      host, source, range, tagValue, workspace, signal, report, audio, forwardThenBackward,
      ffmpeg: this.#resolveFfmpeg(),
      ffprobe: this.#resolveFfprobe(),
      videoPath: path.join(workspace, 'video.mp4'),
      loopedVideoPath: path.join(workspace, 'looped.mp4'),
      mediaPath: path.join(workspace, 'media.mp4'),
    };
    let boundary = await this.#indexedBoundary(job);
    report({ stage: boundary ? 'encoding-video' : 'exact-fallback' });
    let videoResult = boundary ? await this.#encodeIndexedVideo(job, boundary) : null;
    if (signal.aborted) return errorResult('cancelled', 'Encoding was cancelled.');
    if (!videoResult?.ok) {
      console.info('[exact-range-encoder] exact-fallback', { reason: boundary ? videoResult?.code : 'index-unavailable' });
      ({ boundary, videoResult } = await this.#encodeByFullDecode(job));
    }
    if (!videoResult.ok) return errorResult(videoResult.code, 'The selected frames could not be encoded.');
    let finalization;
    try {
      finalization = await this.#finalizeMedia(job, boundary);
    } catch (error) {
      if (!boundary?.frames || signal.aborted) throw error;
      finalization = errorResult('unverified-media', 'The locally encoded media could not be verified.');
    }
    if (!finalization.ok && boundary?.frames && !signal.aborted) {
      await Promise.all([job.videoPath, job.loopedVideoPath, job.mediaPath].map(file => this.#fs.rm(file, { force: true })));
      const fallback = await this.#encodeByFullDecode(job);
      if (!fallback.videoResult.ok) return errorResult(fallback.videoResult.code, 'The selected frames could not be encoded.');
      finalization = await this.#finalizeMedia(job, fallback.boundary);
    }
    if (!finalization.ok) return finalization;
    if (signal.aborted) return errorResult('cancelled', 'Encoding was cancelled.');
    return { ok: true, mediaPath: job.mediaPath, warning: finalization.warning };
  }

  async #encodeByFullDecode(job) {
    const { ffprobe, source, range, signal } = job;
    job.report({ stage: 'exact-fallback' });
    const boundary = await this.#probeFrameTimes(
      ffprobe, source.sourcePath, source.selectedStream, range.startFrameIndex, range.endFrameIndex,
      { runCommand: this.#runCommand, signal, environment: this.#environment });
    return { boundary, videoResult: await this.#encodeVideo(job) };
  }

  async #indexedBoundary({ host, source, range, signal }) {
    if (source.normalizedSourcePath !== null || source.canonicalSourcePath !== source.sourcePath
      || !range.reviewSessionId || !Number.isSafeInteger(source.frameCount)
      || typeof host.extractionFrameTimeline !== 'function'
      || range.endFrameIndex - range.startFrameIndex > 4_999) return null;
    let frames;
    try {
      frames = await host.extractionFrameTimeline(
        range.reviewSessionId, range.sourceHandle, range.startFrameIndex,
        Math.min(source.frameCount - 1, range.endFrameIndex + 1), source.identity);
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
    const expectedCount = range.endFrameIndex - range.startFrameIndex + 1;
    if (!Array.isArray(frames) || frames.length < expectedCount || frames.length > expectedCount + 1) return null;
    const first = frames[0];
    const numerator = first?.timebaseNumerator;
    const denominator = first?.timebaseDenominator;
    if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || numerator <= 0n || denominator <= 0n) return null;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      if (frame.frameIndex !== range.startFrameIndex + index
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
      startUs: FrameTime.microseconds(first.pts, numerator, denominator),
      endUs: FrameTime.microseconds(endPts, numerator, denominator),
      startSeconds, endSeconds, startPts: first.pts, endPts, frames, numerator, denominator,
    };
  }

  async #encodeIndexedVideo({ ffmpeg, source, range, workspace, videoPath, signal, report }, boundary) {
    const seek = Math.max(0, boundary.startSeconds - 5);
    const readDuration = boundary.endSeconds - seek + 2;
    const count = range.endFrameIndex - range.startFrameIndex + 1;
    const result = await this.#runCommand(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-stats_period', '0.5', '-noautorotate',
      '-ss', seek.toFixed(6), '-t', readDuration.toFixed(6), '-copyts', '-i', source.sourcePath,
      '-map', `0:${source.selectedStream}`,
      '-vf', `select='gte(pts,${boundary.startPts})*lt(pts,${boundary.endPts})',showinfo,setpts=PTS-STARTPTS`,
      '-frames:v', String(count), '-fps_mode', 'passthrough', '-an',
      '-c:v', 'libx264', '-crf', '16', '-maxrate', '48M', '-bufsize', '96M', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', videoPath,
    ], { cwd: workspace, signal, env: this.#environment,
      onProgress: frame => report({ stage: 'encoding-video', encodedFrames: Math.min(count, frame), totalFrames: count }) });
    if (!result.ok) return result;
    const timebase = /Parsed_showinfo[^\r\n]*config in time_base:\s*(\d+)\/(\d+)/.exec(result.stderr || '');
    const selected = [...String(result.stderr || '').matchAll(/Parsed_showinfo[^\r\n]*\bn:\s*\d+\s+pts:\s*(-?\d+)/g)];
    if (!timebase || selected.length < count || selected.length > count + 1) {
      console.warn('[exact-range-encoder] local-frame-check', { expected: count, selected: selected.length, hasTimebase: !!timebase });
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
        console.warn('[exact-range-encoder] local-frame-check', { mismatchAt: index, expectedPts: String(expected), actualPts: String(actual) });
        return errorResult('unverified-seek', 'The seeked frames do not match the original index.');
      }
    }
    report({ stage: 'encoding-video', encodedFrames: count, totalFrames: count });
    return result;
  }

  async #encodeVideo({ ffmpeg, source, range, workspace, videoPath, signal, report }) {
    const count = range.endFrameIndex - range.startFrameIndex + 1;
    const result = await this.#runCommand(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-stats_period', '0.5', '-noautorotate', '-i', source.sourcePath,
      '-map', `0:${source.selectedStream}`,
      '-vf', `select='between(n,${range.startFrameIndex},${range.endFrameIndex})',setpts=PTS-STARTPTS`,
      '-frames:v', String(count), '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-crf', '16', '-maxrate', '48M', '-bufsize', '96M', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', videoPath,
    ], { cwd: workspace, signal, env: this.#environment,
      onProgress: frame => report({ stage: 'encoding-video', encodedFrames: Math.min(count, frame), totalFrames: count }) });
    if (result.ok) report({ stage: 'encoding-video', encodedFrames: count, totalFrames: count });
    return result;
  }

  async #finalizeMedia(job, boundary) {
    const { ffmpeg, ffprobe, range, workspace, mediaPath, tagValue, signal } = job;
    let writtenTag = tagValue;
    let warning;
    let videoPath = job.videoPath;
    if (job.forwardThenBackward) {
      job.report({ stage: 'adding-backward-half' });
      const looped = await this.#encodeForwardThenBackward(job);
      if (!looped.ok) return errorResult(looped.code, 'The backward half could not be encoded.');
      videoPath = job.loopedVideoPath;
    }
    if (job.audio) job.report({ stage: 'adding-audio' });
    const muxBase = job.audio ? this.#muxWithAudio(job, videoPath, boundary)
      : ['-hide_banner', '-nostdin', '-y', '-i', videoPath, '-map', '0:v:0', '-c:v', 'copy'];
    let muxResult = await this.#runCommand(ffmpeg, [
      ...muxBase,
      ...(writtenTag ? this.#provenance.muxArguments(writtenTag) : ['-movflags', '+faststart']),
      mediaPath,
    ], { cwd: workspace, signal, env: this.#environment });
    if (!muxResult.ok && writtenTag && !signal.aborted) {
      warning = 'Clip saved without source metadata; the metadata writer failed.';
      writtenTag = null;
      muxResult = await this.#runCommand(ffmpeg, [
        ...muxBase, '-movflags', '+faststart', mediaPath,
      ], { cwd: workspace, signal, env: this.#environment });
    }
    if (!muxResult.ok) return errorResult(muxResult.code, 'The encoded media could not be finalized.');
    const cutFrames = range.endFrameIndex - range.startFrameIndex + 1;
    await this.#verifyMedia(ffprobe, mediaPath, {
      runCommand: this.#runCommand, signal, environment: this.#environment,
      expectedFrames: job.forwardThenBackward ? 2 * cutFrames : cutFrames,
    });
    if (writtenTag) {
      try {
        const readBack = await this.#provenance.readBack(mediaPath);
        if (readBack !== writtenTag) throw new Error('Clip provenance readback differs from the written record.');
      } catch {
        warning = 'Clip saved, but its source metadata could not be verified.';
      }
    }
    return { ok: true, warning };
  }

  #muxWithAudio({ source }, videoPath, boundary) {
    const startSeconds = (Number(boundary.startUs) / 1_000_000).toFixed(6);
    const endSeconds = (Number(boundary.endUs) / 1_000_000).toFixed(6);
    const audioSeek = boundary.startSeconds === undefined ? []
      : ['-ss', Math.max(0, boundary.startSeconds - 5).toFixed(6)];
    return [
      '-hide_banner', '-nostdin', '-y', '-copyts', '-i', videoPath, ...audioSeek, '-i', source.sourcePath,
      '-map', '0:v:0', '-map', '1:a:0?', '-filter:a', `atrim=start=${startSeconds}:end=${endSeconds},asetpts=PTS-STARTPTS`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    ];
  }

  async #encodeForwardThenBackward({ ffmpeg, workspace, videoPath, loopedVideoPath, signal }) {
    return this.#runCommand(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-i', videoPath,
      '-filter_complex', ForwardThenBackwardFilter.graph('0:v:0'), '-map', ForwardThenBackwardFilter.output,
      '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-crf', '16', '-maxrate', '48M', '-bufsize', '96M', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', loopedVideoPath,
    ], { cwd: workspace, signal, env: this.#environment });
  }
}

module.exports = { ExactRangeEncoder };
