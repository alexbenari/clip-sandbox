class FrameTime {
  static microseconds(ticks, timebaseNumerator, timebaseDenominator) {
    return ticks * timebaseNumerator * 1_000_000n / timebaseDenominator;
  }
}

module.exports = { FrameTime };
