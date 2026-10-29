// Every frame of the window is listed exactly once, so no frame is skipped on the strength of an estimate.
class AnchorSearchOrder {
  static *outward(estimate, frameCount) {
    yield* AnchorSearchOrder.#outwardWithin(estimate, 0, frameCount - 1);
  }

  static *widened(estimate, frameCount, previousFirst, previousLast) {
    const first = Math.max(0, Math.min(previousFirst, frameCount - 1));
    const last = Math.max(first, Math.min(previousLast, frameCount - 1));
    for (let distance = 1; first - distance >= 0 || last + distance < frameCount; distance += 1) {
      if (first - distance >= 0) yield first - distance;
      if (last + distance < frameCount) yield last + distance;
    }
    yield* AnchorSearchOrder.#outwardWithin(estimate, first, last);
  }

  static *#outwardWithin(estimate, first, last) {
    if (last < first) return;
    const center = Math.max(first, Math.min(Math.round(estimate), last));
    yield center;
    for (let distance = 1; center - distance >= first || center + distance <= last; distance += 1) {
      if (center + distance <= last) yield center + distance;
      if (center - distance >= first) yield center - distance;
    }
  }
}

module.exports = { AnchorSearchOrder };
