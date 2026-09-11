import type {
  CandidateId,
  ICandidateSnapshot,
  IFramePosition,
  PlaybackRate,
  ISharedMovieSource,
} from './types';

export interface IFramePlaybackControl {
  readonly id: CandidateId;
  readonly label: string;
  mount(host: HTMLElement): void;
  loadMovie(
    source: ISharedMovieSource,
    options?: { initialPosition?: IFramePosition | null },
  ): Promise<void>;
  activate(options?: { handoffPosition?: IFramePosition | null }): Promise<void>;
  deactivate(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<IFramePosition | null>;
  setPlaybackRate(rate: PlaybackRate): Promise<void>;
  stepFrames(delta: number): Promise<IFramePosition | null>;
  seekToFrame(frameIndex: number): Promise<IFramePosition | null>;
  scrubToRatio(ratio: number): Promise<IFramePosition | null>;
  getSelectedStepSize(): 1 | 10;
  getCurrentPosition(): IFramePosition | null;
  getSnapshot(): ICandidateSnapshot;
  reportLoadFailure(error: unknown): void;
  onSnapshotChanged(listener: (snapshot: ICandidateSnapshot) => void): () => void;
  dispose(): Promise<void>;
}
