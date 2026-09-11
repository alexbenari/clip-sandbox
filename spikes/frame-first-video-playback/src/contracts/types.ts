export type CandidateId = 'candidate-a' | 'candidate-b';

export type PlaybackRate = 0.25 | 0.5 | 1 | 2;

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

export interface ISharedMovieSource {
  readonly file: File;
  readonly label: string;
  readonly objectUrl: string;
  readonly size: number;
  readonly lastModified: number;
  readonly frameIndex: IMovieFrameIndex;
}

export interface IFramePosition {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly durationMs: number;
  readonly keyframe: boolean | null;
}

export interface IMovieFrameIndex {
  readonly frames: readonly IFramePosition[];
  readonly frameCount: number;
  readonly durationMs: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly codec: string | null;
}

export interface ICandidateSnapshot {
  readonly candidateId: CandidateId;
  readonly status: PlaybackStatus;
  readonly playbackRate: PlaybackRate;
  readonly selectedStepSize: 1 | 10;
  readonly currentPosition: IFramePosition | null;
  readonly frameCount: number | null;
  readonly durationMs: number | null;
  readonly message: string | null;
  readonly active: boolean;
}

export interface ICapturedFrameRange {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly start: IFramePosition;
  readonly end: IFramePosition;
  readonly label: string;
}

export interface IRangeDraft {
  readonly start: IFramePosition | null;
  readonly end: IFramePosition | null;
  readonly error: string | null;
  readonly lastLockedRangeId: string | null;
}
