const { AnchorSearchOrder } = require('./anchor-search-order.cjs');
const { FrameTime } = require('./frame-time.cjs');
const { EXTENSION_LIMIT_US } = require('./movie-window-placement.cjs');

// Window frame numbers come from finding a reference frame by its check value, never from times.
class MovieWindowAnchor {
  async find({ host, sessionId, window: { sourceHandle, sourceInfo, placement, previousWindow } }) {
    const reader = host.exactFrameReader(sessionId, sourceHandle);
    const { range, referenceFrames } = sourceInfo;
    const frameUs = this.#frameDurationUs(await reader.frameIdentity(0));
    for (const reference of referenceFrames) {
      const estimate = (this.#referenceTimeUs(range, placement.clip, reference, frameUs) - placement.window.startUs) / frameUs;
      const order = previousWindow
        ? AnchorSearchOrder.widened(estimate, reader.frameCount,
          this.#frameAt(placement.window, previousWindow.startUs, frameUs),
          this.#frameAt(placement.window, previousWindow.startUs + previousWindow.durationUs, frameUs))
        : AnchorSearchOrder.outward(estimate, reader.frameCount);
      const found = await host.findFrameByCheckValue(sessionId, sourceHandle, reference.frameInfoHash, order);
      if (found === null) continue;
      const offset = reference.frameIndex - found;
      const clipStartFrame = range.start - offset;
      const clipEndFrame = range.end - offset;
      // A reference found while the clip runs past an edge of the window means the window must widen.
      if (clipStartFrame < 0 || clipEndFrame >= reader.frameCount) return null;
      return {
        offset,
        referenceFrameIndex: reference.frameIndex,
        referenceWindowTimeUs: FrameTime.safeMicrosecondsOf(await reader.frameIdentity(found)),
        clipStartFrame,
        earliestFrame: await this.#farthestFrameWithin(reader, clipStartFrame, -EXTENSION_LIMIT_US),
        latestFrame: await this.#farthestFrameWithin(reader, clipEndFrame, EXTENSION_LIMIT_US),
      };
    }
    return null;
  }

  #referenceTimeUs(range, clip, reference, frameUs) {
    if (reference.frameIndex === range.end) return clip.endUs;
    return clip.startUs + (reference.frameIndex - range.start) * frameUs;
  }

  #frameAt(window, timeUs, frameUs) {
    return Math.round((timeUs - window.startUs) / frameUs);
  }

  // Frame times only grow along a window, so the limit is found by bisection.
  async #farthestFrameWithin(reader, fromFrame, limitUs) {
    const timeOf = async frameIndex => {
      const { pts, timebaseNumerator, timebaseDenominator } = await reader.frameIdentity(frameIndex);
      return Number(FrameTime.microseconds(pts, timebaseNumerator, timebaseDenominator));
    };
    const boundUs = await timeOf(fromFrame) + limitUs;
    const forward = limitUs > 0;
    let inside = fromFrame;
    let outside = forward ? reader.frameCount : -1;
    while (Math.abs(outside - inside) > 1) {
      const middle = Math.floor((inside + outside) / 2);
      const middleUs = await timeOf(middle);
      if (forward ? middleUs <= boundUs : middleUs >= boundUs) inside = middle;
      else outside = middle;
    }
    return inside;
  }

  #frameDurationUs({ duration, timebaseNumerator, timebaseDenominator }) {
    const durationUs = Number(FrameTime.microseconds(duration, timebaseNumerator, timebaseDenominator));
    if (!(durationUs > 0)) throw new Error('The movie window frame duration is unavailable.');
    return durationUs;
  }
}

module.exports = { MovieWindowAnchor };
