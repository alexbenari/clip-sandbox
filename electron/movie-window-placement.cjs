const EXTENSION_LIMIT_US = 60_000_000;
// Beyond the extension limit, so an estimated placement still holds the clip and a minute around it.
const PLACEMENT_MARGIN_US = 15_000_000;
// Clips are seconds long; a longer stored span would copy most of a movie into the cache.
const MAX_CLIP_SPAN_US = 10 * 60_000_000;

class MovieWindowPlacement {
  #probeFrameRate;

  constructor({ probeFrameRate }) {
    this.#probeFrameRate = probeFrameRate;
  }

  async place({ host, moviePath, sourceInfo, widen }) {
    const clip = await this.#clipTimes(host, moviePath, sourceInfo);
    if (clip.endUs - clip.startUs > MAX_CLIP_SPAN_US) throw new Error('The clip is too long for a movie window.');
    const marginUs = (EXTENSION_LIMIT_US + PLACEMENT_MARGIN_US) * 2 ** widen;
    const startUs = Math.max(0, clip.startUs - marginUs);
    return { clip, window: { startUs, durationUs: clip.endUs + marginUs - startUs } };
  }

  async #clipTimes(host, moviePath, sourceInfo) {
    const { start, end, startTimeUs, endTimeUs } = sourceInfo.range;
    if (startTimeUs !== undefined && endTimeUs !== undefined) return this.#ordered(startTimeUs, endTimeUs);
    const cached = await host.cachedFrameTimesUs(moviePath, [start, end]);
    if (cached) return this.#ordered(Number(cached[0]), Number(cached[1]));
    const framesPerSecond = await this.#probeFrameRate(moviePath, sourceInfo.sourceMovie.fingerprint.selectedStream);
    if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) throw new Error('The movie frame rate is unavailable.');
    const estimate = frameIndex => Math.round(frameIndex * 1_000_000 / framesPerSecond);
    return this.#ordered(startTimeUs ?? estimate(start), endTimeUs ?? estimate(end));
  }

  #ordered(startUs, endUs) {
    return { startUs, endUs: Math.max(startUs, endUs) };
  }
}

module.exports = { MovieWindowPlacement, EXTENSION_LIMIT_US };
