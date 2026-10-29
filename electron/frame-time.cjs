class FrameTime {
  static microseconds(ticks, timebaseNumerator, timebaseDenominator) {
    return ticks * timebaseNumerator * 1_000_000n / timebaseDenominator;
  }

  // Undefined when the frame's time is negative or too large for a safe integer.
  static safeMicrosecondsOf({ pts, timebaseNumerator, timebaseDenominator }) {
    const timeUs = FrameTime.microseconds(pts, timebaseNumerator, timebaseDenominator);
    return timeUs >= 0n && timeUs <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(timeUs) : undefined;
  }
}

module.exports = { FrameTime };
