import type { FramePosition, MovieFrameIndex } from '../../contracts/types';

export function clampFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, Math.round(frameIndex)), frameCount - 1);
}

export function positionForFrame(
  frameIndex: number,
  index: MovieFrameIndex,
): FramePosition {
  return index.frames[clampFrameIndex(frameIndex, index.frameCount)];
}

export function findFrameIndexForRatio(ratio: number, index: MovieFrameIndex): number {
  return clampFrameIndex(ratio * (index.frameCount - 1), index.frameCount);
}

export function findFrameIndexForTimeMs(
  timestampMs: number,
  index: MovieFrameIndex,
): number {
  let low = 0;
  let high = index.frameCount - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = index.frames[mid];
    const frameEndMs = frame.timestampMs + frame.durationMs;

    if (timestampMs < frame.timestampMs) {
      high = mid - 1;
      continue;
    }

    if (timestampMs >= frameEndMs) {
      low = mid + 1;
      continue;
    }

    return frame.frameIndex;
  }

  return clampFrameIndex(low, index.frameCount);
}
