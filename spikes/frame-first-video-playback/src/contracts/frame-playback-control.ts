import type {
  CandidateId,
  CandidateSnapshot,
  FramePosition,
  PlaybackRate,
  SharedMovieSource,
} from './types';

export interface FramePlaybackControl {
  readonly id: CandidateId;
  readonly label: string;
  mount(host: HTMLElement): void;
  loadMovie(
    source: SharedMovieSource,
    options?: { initialPosition?: FramePosition | null },
  ): Promise<void>;
  activate(options?: { handoffPosition?: FramePosition | null }): Promise<void>;
  deactivate(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<FramePosition | null>;
  setPlaybackRate(rate: PlaybackRate): Promise<void>;
  stepFrames(delta: number): Promise<FramePosition | null>;
  seekToFrame(frameIndex: number): Promise<FramePosition | null>;
  scrubToRatio(ratio: number): Promise<FramePosition | null>;
  getSelectedStepSize(): 1 | 10;
  getCurrentPosition(): FramePosition | null;
  getSnapshot(): CandidateSnapshot;
  reportLoadFailure(error: unknown): void;
  onSnapshotChanged(listener: (snapshot: CandidateSnapshot) => void): () => void;
  dispose(): Promise<void>;
}
