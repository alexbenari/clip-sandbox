import type { ISourceFrameIdentity } from './source-frame-identity.js';

export interface ICapturedFrameRange {
  readonly start: ISourceFrameIdentity;
  readonly end: ISourceFrameIdentity;
}

export function capturedFrameRange(start: ISourceFrameIdentity, end: ISourceFrameIdentity): ICapturedFrameRange {
  if (end.frameIndex < start.frameIndex) throw new Error('Captured frame range end precedes its start.');
  return Object.freeze({ start, end });
}
