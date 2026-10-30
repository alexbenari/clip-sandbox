const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { mediaSourceOf } = require('./folder-entry.cjs');
const { FrameTime } = require('./frame-time.cjs');
const { ForwardThenBackwardFilter } = require('./forward-then-backward-filter.cjs');
const { runProcess } = require('./process-runner.cjs');
const { StagedEditRefusal } = require('./staged-edit-resolver.cjs');
const { OperationResult } = require('./operation-result.cjs');

const PREVIEW_WIDTH = 960;
const SEEK_MARGIN_SECONDS = 5;
// Half a millisecond either side of the staged ends' times, far less than one frame.
const FRAME_TIME_TOLERANCE_SECONDS = 0.0005;

// Each preview is of the staged edits with Loopify. A new preview replaces the app window's previous one,
// and the files live only in this app session's preview folder.
class ZoomEditPreviews {
  #folder;
  #stagedEdits;
  #resolveFfmpeg;
  #runCommand;
  #environment;
  #fs;
  #randomId;
  #previews = new Map();

  constructor({ folder, stagedEdits, resolveFfmpeg, runCommand = runProcess, environment = process.env,
    fileSystem = fs, randomId = () => randomBytes(12).toString('base64url') }) {
    if (!path.isAbsolute(String(folder || '')) || !stagedEdits || typeof resolveFfmpeg !== 'function') {
      throw new Error('Zoom edit preview dependencies are invalid.');
    }
    this.#folder = folder;
    this.#stagedEdits = stagedEdits;
    this.#resolveFfmpeg = resolveFfmpeg;
    this.#runCommand = runCommand;
    this.#environment = environment;
    this.#fs = fileSystem;
    this.#randomId = randomId;
  }

  async initialize() {
    await this.#fs.rm(this.#folder, { recursive: true, force: true });
    await this.#fs.mkdir(this.#folder, { recursive: true });
  }

  async render(event, request, report = () => undefined) {
    const senderId = event.sender.id;
    const preview = { controller: new AbortController(), report, filePath: null, done: null };
    const previous = this.#previews.get(senderId);
    this.#previews.set(senderId, preview);
    preview.done = this.#releasing(previous).then(() => this.#rendered(event, request, preview));
    return preview.done;
  }

  async release(senderId) {
    const preview = this.#previews.get(senderId);
    this.#previews.delete(senderId);
    await this.#releasing(preview);
  }

  async dispose() {
    await Promise.allSettled([...this.#previews.keys()].map(senderId => this.release(senderId)));
    await this.#fs.rm(this.#folder, { recursive: true, force: true }).catch(error => {
      console.warn('[zoom-edit-preview] folder-cleanup-failed', { code: error?.code });
    });
  }

  async #releasing(preview) {
    if (!preview) return;
    preview.controller.abort();
    await preview.done?.catch(() => undefined);
    await this.#removed(preview);
  }

  async #rendered(event, request, preview) {
    const { controller: { signal }, report } = preview;
    try {
      if (signal.aborted) return OperationResult.failure('cancelled', 'The preview was replaced.');
      const { host, cut } = await this.#stagedEdits.resolve(event, { ...request, edits: ['loopify'] });
      const source = await host.prepareExtractionSource(cut.sourceHandle, signal);
      const [start, end] = await cut.endIdentities();
      const startUs = FrameTime.safeMicrosecondsOf(start);
      const endUs = FrameTime.safeMicrosecondsOf(end);
      if (startUs === undefined || endUs === undefined) throw new Error('The staged frames have no usable times.');
      preview.filePath = path.join(this.#folder, `preview-${this.#randomId()}.mp4`);
      const totalFrames = 2 * (cut.endFrame - cut.startFrame + 1);
      const result = await this.#runCommand(this.#resolveFfmpeg(), this.#arguments({ source, startUs, endUs, outputPath: preview.filePath }), {
        cwd: this.#folder, signal, env: this.#environment,
        onProgress: frame => report({ renderedFrames: Math.min(frame, totalFrames), totalFrames }),
      });
      if (signal.aborted) return OperationResult.failure('cancelled', 'The preview was replaced.');
      if (!result.ok) throw Object.assign(new Error('The preview could not be encoded.'), { code: result.code });
      const stat = await this.#fs.stat(preview.filePath);
      return { ok: true, result: { mediaSource: mediaSourceOf(preview.filePath, stat.mtimeMs) } };
    } catch (error) {
      await this.#removed(preview);
      if (error instanceof StagedEditRefusal) return OperationResult.failure(error.code, error.message);
      if (signal.aborted) return OperationResult.failure('cancelled', 'The preview was replaced.');
      console.warn('[zoom-edit-preview] preview-failed', { kind: error instanceof Error ? error.name : 'unknown', code: error?.code });
      return OperationResult.failure('preview-failed', 'The preview could not be made.');
    }
  }

  // The staged frames are chosen by their times in the source the review indexed, read with absolute timestamps.
  #arguments({ source, startUs, endUs, outputPath }) {
    const startSeconds = startUs / 1_000_000 - FRAME_TIME_TOLERANCE_SECONDS;
    const endSeconds = endUs / 1_000_000 + FRAME_TIME_TOLERANCE_SECONDS;
    const seek = Math.max(0, startSeconds - SEEK_MARGIN_SECONDS);
    const staged = `select='between(t,${startSeconds.toFixed(6)},${endSeconds.toFixed(6)})',setpts=PTS-STARTPTS,`
      + `scale='min(${PREVIEW_WIDTH},trunc(iw/2)*2)':-2,`;
    return [
      '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-stats_period', '0.5', '-noautorotate',
      '-ss', seek.toFixed(6), '-t', (endSeconds - seek + 1).toFixed(6), '-copyts', '-i', source.canonicalSourcePath,
      '-filter_complex', ForwardThenBackwardFilter.graph(`0:${source.selectedStream}`, staged),
      '-map', ForwardThenBackwardFilter.output, '-fps_mode', 'passthrough', '-an',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath,
    ];
  }

  async #removed(preview) {
    const { filePath } = preview;
    if (!filePath) return;
    preview.filePath = null;
    try {
      await this.#fs.rm(filePath, { force: true });
    } catch (error) {
      console.warn('[zoom-edit-preview] preview-cleanup-failed', { code: error?.code });
    }
  }
}

module.exports = { ZoomEditPreviews };
