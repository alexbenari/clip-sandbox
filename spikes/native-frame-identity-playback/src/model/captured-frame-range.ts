import type { SourceFrameIdentity } from './source-frame-identity.js';

export interface CapturedFrameRange {
  readonly start: SourceFrameIdentity;
  readonly end: SourceFrameIdentity;
}

export function capturedFrameRange(start: SourceFrameIdentity, end: SourceFrameIdentity): CapturedFrameRange {
  if (end.frameIndex < start.frameIndex) throw new Error('Captured frame range end precedes its start.');
  return Object.freeze({ start, end });
}
