const { FrameTime } = require('./frame-time.cjs');
const { SourceInfo } = require('./clip-provenance/source-info.cjs');

class AnchoredMovieWindow {
  #moviePath;
  #sourceInfo;
  #anchor;
  #host;
  #referenceMovieTimeUs = null;

  constructor({ clipPath, moviePath, sourceInfo, sourceHandle, anchor, host }) {
    this.clipPath = clipPath;
    this.sourceHandle = sourceHandle;
    this.#moviePath = moviePath;
    this.#sourceInfo = sourceInfo;
    this.#anchor = anchor;
    this.#host = host;
    Object.freeze(this);
  }

  isWithinExtensionLimit(startFrame, endFrame) {
    return startFrame >= this.#anchor.earliestFrame && endFrame <= this.#anchor.latestFrame;
  }

  async movieRecordOf(startIdentity, endIdentity) {
    const [startTimeUs, endTimeUs] = await Promise.all([this.#movieTimeUsOf(startIdentity), this.#movieTimeUsOf(endIdentity)]);
    const times = startTimeUs === undefined || endTimeUs === undefined ? {} : { startTimeUs, endTimeUs };
    const start = this.#movieFrame(startIdentity.frameIndex);
    const end = this.#movieFrame(endIdentity.frameIndex);
    return SourceInfo.forMovieRange(this.#sourceInfo.sourceMovie, { start, end, ...times }, [
      { frameIndex: start, frameInfoHash: startIdentity.frameInfoHash },
      { frameIndex: end, frameInfoHash: endIdentity.frameInfoHash },
    ]);
  }

  #movieFrame(windowFrame) {
    return windowFrame + this.#anchor.offset;
  }

  // Undefined unless the movie time of the reference frame the window was anchored by is known exactly.
  async #movieTimeUsOf(windowFrameIdentity) {
    this.#referenceMovieTimeUs ??= this.#exactReferenceMovieTimeUs();
    const referenceMovieUs = await this.#referenceMovieTimeUs;
    const windowTimeUs = FrameTime.safeMicrosecondsOf(windowFrameIdentity);
    const { referenceWindowTimeUs } = this.#anchor;
    if (referenceMovieUs === undefined || referenceWindowTimeUs === undefined || windowTimeUs === undefined) return undefined;
    const movieTimeUs = windowTimeUs + referenceMovieUs - referenceWindowTimeUs;
    return Number.isSafeInteger(movieTimeUs) && movieTimeUs >= 0 ? movieTimeUs : undefined;
  }

  async #exactReferenceMovieTimeUs() {
    const { referenceFrameIndex } = this.#anchor;
    const storedUs = this.#sourceInfo.exactTimeUsOf(referenceFrameIndex);
    if (storedUs !== undefined) return storedUs;
    try {
      const times = await this.#host.cachedFrameTimesUs(this.#moviePath, [referenceFrameIndex]);
      const cachedUs = times ? Number(times[0]) : undefined;
      return Number.isSafeInteger(cachedUs) ? cachedUs : undefined;
    } catch (error) {
      console.warn('[zoom-edit-sources] cached-frame-time-unavailable', { kind: error instanceof Error ? error.name : 'unknown' });
      return undefined;
    }
  }
}

module.exports = { AnchoredMovieWindow };
