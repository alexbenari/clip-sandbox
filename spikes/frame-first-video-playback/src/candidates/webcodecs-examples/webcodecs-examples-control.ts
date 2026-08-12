import { WebCodecsPlayer } from 'webcodecs-examples';

import type { FramePlaybackControl } from '../../contracts/frame-playback-control';
import type {
  CandidateSnapshot,
  FramePosition,
  PlaybackRate,
  SharedMovieSource,
} from '../../contracts/types';
import {
  findFrameIndexForRatio,
  findFrameIndexForTimeMs,
  positionForFrame,
} from '../shared/frame-navigation';
import { WebCodecsExamplesPanel } from './webcodecs-examples-panel';

type SnapshotListener = (snapshot: CandidateSnapshot) => void;

export class WebCodecsExamplesControl implements FramePlaybackControl {
  readonly id = 'candidate-a' as const;

  readonly label = 'Candidate A';

  private readonly listeners = new Set<SnapshotListener>();

  private readonly panel = new WebCodecsExamplesPanel({
    onPlayPause: () => {
      void this.togglePlayPause();
    },
    onStop: () => {
      void this.stop();
    },
    onStep: (delta) => {
      void this.stepFrames(delta);
    },
    onRateChange: (rate) => {
      void this.setPlaybackRate(rate);
    },
    onScrubStart: () => {
      this.wasPlayingBeforeScrub = this.snapshot.status === 'playing';
      if (this.wasPlayingBeforeScrub) {
        void this.pause();
      }
    },
    onScrubChange: (ratio) => {
      void this.scrubToRatio(ratio);
    },
    onScrubEnd: (ratio) => {
      void this.scrubToRatio(ratio).then(async () => {
        if (this.wasPlayingBeforeScrub) {
          await this.play();
        }
      });
    },
  });

  private snapshot: CandidateSnapshot = {
    candidateId: 'candidate-a',
    status: 'idle',
    playbackRate: 1,
    selectedStepSize: 1,
    currentPosition: null,
    frameCount: null,
    durationMs: null,
    message: 'Waiting for movie.',
    active: false,
  };

  private source: SharedMovieSource | null = null;

  private player: WebCodecsPlayer | null = null;

  private tickListener: ((...args: unknown[]) => void) | null = null;

  private wasPlayingBeforeScrub = false;

  mount(host: HTMLElement): void {
    this.panel.mount(host);
    this.panel.update(this.snapshot);
  }

  async loadMovie(
    source: SharedMovieSource,
    options?: { initialPosition?: FramePosition | null },
  ): Promise<void> {
    if (!source.file.name.toLowerCase().endsWith('.mp4')) {
      throw new Error('Candidate A supports MP4 input only.');
    }

    this.source = source;
    this.updateSnapshot({
      status: 'loading',
      message: 'Initializing webcodecs-examples player...',
      frameCount: source.frameIndex.frameCount,
      durationMs: source.frameIndex.durationMs,
    });

    this.player?.terminate();
    this.player = new WebCodecsPlayer({
      src: source.file,
      canvas: this.panel.getCanvas(),
    });
    await this.player.initialize();

    this.tickListener = (...args: unknown[]) => {
      const timeSeconds = Number(args[0] ?? 0);
      this.updatePositionFromTime(
        timeSeconds * 1_000,
        this.snapshot.status === 'playing' ? 'Playing' : null,
      );
    };
    this.player.on('tick', this.tickListener);
    this.player.on('pause', () => {
      this.updateSnapshot({
        status: 'paused',
        message: 'Paused',
      });
    });
    this.player.on('play', () => {
      this.updateSnapshot({
        status: 'playing',
        message: 'Playing with built-in audio preview.',
      });
    });
    this.player.on('ended', () => {
      void this.stop();
    });

    const initialPosition = options?.initialPosition ?? positionForFrame(0, source.frameIndex);
    await this.player.seek(initialPosition.timestampMs / 1_000);
    this.updateSnapshot({
      status: 'paused',
      currentPosition: initialPosition,
      message:
        'Built-in audio preview works. Playback-rate control is not exposed by the package API.',
    });
  }

  async activate(options?: { handoffPosition?: FramePosition | null }): Promise<void> {
    this.updateSnapshot({
      active: true,
    });

    if (this.source && options?.handoffPosition) {
      await this.seekToFrame(options.handoffPosition.frameIndex);
    }
  }

  async deactivate(): Promise<void> {
    await this.pause();
    this.updateSnapshot({
      active: false,
    });
  }

  async play(): Promise<void> {
    if (!this.player) {
      return;
    }

    await this.player.play();
    this.updateSnapshot({
      status: 'playing',
      message: 'Playing with built-in audio preview.',
    });
  }

  async pause(): Promise<void> {
    if (!this.player) {
      return;
    }

    await this.player.pause();
    this.updateSnapshot({
      status: 'paused',
      message: 'Paused',
    });
  }

  async stop(): Promise<FramePosition | null> {
    if (!this.player || !this.source) {
      return this.snapshot.currentPosition;
    }

    await this.player.pause();
    const firstFrame = positionForFrame(0, this.source.frameIndex);
    await this.seekAndRenderPosition(firstFrame);
    this.updateSnapshot({
      status: 'paused',
      currentPosition: firstFrame,
      message: 'Stopped at first frame.',
    });
    return firstFrame;
  }

  async setPlaybackRate(rate: PlaybackRate): Promise<void> {
    this.updateSnapshot({
      playbackRate: rate,
      message: 'Candidate A package does not expose playback-rate control.',
    });
  }

  async stepFrames(delta: number): Promise<FramePosition | null> {
    if (!this.source || !this.player) {
      return this.snapshot.currentPosition;
    }

    await this.pause();
    const currentFrameIndex = this.snapshot.currentPosition?.frameIndex ?? 0;
    const targetPosition = positionForFrame(currentFrameIndex + delta, this.source.frameIndex);
    await this.seekAndRenderPosition(targetPosition);
    this.updateSnapshot({
      currentPosition: targetPosition,
      selectedStepSize: Math.abs(delta) >= 10 ? 10 : 1,
      status: 'paused',
      message: `Stepped to frame ${targetPosition.frameIndex}.`,
    });
    return targetPosition;
  }

  async seekToFrame(frameIndex: number): Promise<FramePosition | null> {
    if (!this.source || !this.player) {
      return this.snapshot.currentPosition;
    }

    const targetPosition = positionForFrame(frameIndex, this.source.frameIndex);
    await this.seekAndRenderPosition(targetPosition);
    this.updateSnapshot({
      currentPosition: targetPosition,
      message: `Sought to frame ${targetPosition.frameIndex} via frame-index adapter.`,
    });
    return targetPosition;
  }

  async scrubToRatio(ratio: number): Promise<FramePosition | null> {
    if (!this.source) {
      return this.snapshot.currentPosition;
    }

    return this.seekToFrame(findFrameIndexForRatio(ratio, this.source.frameIndex));
  }

  getCurrentPosition(): FramePosition | null {
    return this.snapshot.currentPosition;
  }

  getSelectedStepSize(): 1 | 10 {
    return this.snapshot.selectedStepSize;
  }

  getSnapshot(): CandidateSnapshot {
    return this.snapshot;
  }

  reportLoadFailure(error: unknown): void {
    this.player?.terminate();
    this.player = null;
    this.updateSnapshot({
      status: 'error',
      active: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  onSnapshotChanged(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async dispose(): Promise<void> {
    this.player?.terminate();
    this.listeners.clear();
  }

  private async togglePlayPause(): Promise<void> {
    if (this.snapshot.status === 'playing') {
      await this.pause();
      return;
    }

    await this.play();
  }

  private async seekAndRenderPosition(position: FramePosition): Promise<void> {
    if (!this.player) {
      return;
    }

    await this.player.seek(position.timestampMs / 1_000);

    const runtimePlayer = this.player as unknown as {
      renderer?: { render: (timeSeconds: number) => void };
    };

    runtimePlayer.renderer?.render(position.timestampMs / 1_000);
  }

  private updatePositionFromTime(timestampMs: number, message: string | null): void {
    if (!this.source) {
      return;
    }

    const frameIndex = findFrameIndexForTimeMs(timestampMs, this.source.frameIndex);
    this.updateSnapshot({
      currentPosition: positionForFrame(frameIndex, this.source.frameIndex),
      message,
    });
  }

  private updateSnapshot(patch: Partial<CandidateSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };
    this.panel.update(this.snapshot);
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
