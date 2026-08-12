export type CandidateId = 'candidate-a' | 'candidate-b';

export type PlaybackRate = 0.25 | 0.5 | 1 | 2;

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

export interface SharedMovieSource {
  readonly file: File;
  readonly label: string;
  readonly objectUrl: string;
  readonly size: number;
  readonly lastModified: number;
  readonly frameIndex: MovieFrameIndex;
}

export interface FramePosition {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly durationMs: number;
  readonly keyframe: boolean | null;
}

export interface MovieFrameIndex {
  readonly frames: readonly FramePosition[];
  readonly frameCount: number;
  readonly durationMs: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly codec: string | null;
}

export interface CandidateSnapshot {
  readonly candidateId: CandidateId;
  readonly status: PlaybackStatus;
  readonly playbackRate: PlaybackRate;
  readonly selectedStepSize: 1 | 10;
  readonly currentPosition: FramePosition | null;
  readonly frameCount: number | null;
  readonly durationMs: number | null;
  readonly message: string | null;
  readonly active: boolean;
}

export interface CapturedFrameRange {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly start: FramePosition;
  readonly end: FramePosition;
  readonly label: string;
}

export interface RangeDraft {
  readonly start: FramePosition | null;
  readonly end: FramePosition | null;
  readonly error: string | null;
  readonly lastLockedRangeId: string | null;
}
