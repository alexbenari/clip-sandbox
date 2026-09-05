export type MediaState = 'closed' | 'opening' | 'playback-ready' | 'exact-ready' |
  'playing' | 'paused' | 'stopping' | 'stopped' | 'failed';

export interface MediaStatus {
  readonly state: MediaState;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly numFrames?: number;
  readonly timeUs?: bigint;
  readonly lengthUs?: bigint;
  readonly rate?: number;
}
