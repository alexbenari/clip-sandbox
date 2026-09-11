import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';

import type { IFramePlaybackControl } from '../../contracts/frame-playback-control';
import type {
  ICandidateSnapshot,
  IFramePosition,
  PlaybackRate,
  ISharedMovieSource,
} from '../../contracts/types';
import {
  findFrameIndexForRatio,
  findFrameIndexForTimeMs,
  positionForFrame,
} from '../shared/frame-navigation';
import { MediabunnyPanel } from './mediabunny-panel';
import { assertVideoTrackCanDecode } from './video-decode-preflight';

type SnapshotListener = (snapshot: ICandidateSnapshot) => void;

export class MediabunnyControl implements IFramePlaybackControl {
  readonly id = 'candidate-b' as const;

  readonly label = 'Candidate B';

  private readonly listeners = new Set<SnapshotListener>();

  private readonly panel = new MediabunnyPanel({
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
      this.scrubResumePlayback = this.snapshot.status === 'playing';
      if (this.scrubResumePlayback) {
        void this.pause();
      }
    },
    onScrubChange: (ratio) => {
      void this.scrubToRatio(ratio);
    },
    onScrubEnd: (ratio) => {
      void this.scrubToRatio(ratio).then(async () => {
        if (this.scrubResumePlayback) {
          await this.play();
        }
      });
    },
  });

  private snapshot: ICandidateSnapshot = {
    candidateId: 'candidate-b',
    status: 'idle',
    playbackRate: 1,
    selectedStepSize: 1,
    currentPosition: null,
    frameCount: null,
    durationMs: null,
    message: 'Waiting for movie.',
    active: false,
  };

  private source: ISharedMovieSource | null = null;

  private input: Input | null = null;

  private videoTrack: InputVideoTrack | null = null;

  private canvasSink: CanvasSink | null = null;

  private renderRequestSerial = 0;

  private playbackRequestId = 0;

  private playbackAnchorPerfMs = 0;

  private playbackAnchorTimestampMs = 0;

  private scrubResumePlayback = false;

  mount(host: HTMLElement): void {
    this.panel.mount(host);
    this.panel.update(this.snapshot);
  }

  async loadMovie(
    source: ISharedMovieSource,
    options?: { initialPosition?: IFramePosition | null },
  ): Promise<void> {
    this.source = source;
    this.updateSnapshot({
      status: 'loading',
      message: 'Loading Mediabunny input and checking video decodability...',
      frameCount: source.frameIndex.frameCount,
      durationMs: source.frameIndex.durationMs,
    });

    this.input = new Input({
      source: new BlobSource(source.file),
      formats: ALL_FORMATS,
    });
    this.videoTrack = await this.input.getPrimaryVideoTrack();
    if (!this.videoTrack) {
      throw new Error('Candidate B could not find a primary video track.');
    }

    await assertVideoTrackCanDecode(this.videoTrack);

    this.canvasSink = new CanvasSink(this.videoTrack, {
      fit: 'contain',
    });

    const canvas = this.panel.getCanvas();
    canvas.width = source.frameIndex.displayWidth;
    canvas.height = source.frameIndex.displayHeight;

    const initialPosition = options?.initialPosition ?? positionForFrame(0, source.frameIndex);
    await this.renderFrameAtIndex(initialPosition.frameIndex, {
      message: 'Loaded. Audio preview not implemented in this candidate.',
      status: 'paused',
    });
  }

  async activate(options?: { handoffPosition?: IFramePosition | null }): Promise<void> {
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
    if (!this.source || !this.snapshot.currentPosition) {
      return;
    }

    this.playbackRequestId += 1;
    this.playbackAnchorPerfMs = performance.now();
    this.playbackAnchorTimestampMs = this.snapshot.currentPosition.timestampMs;
    this.updateSnapshot({
      status: 'playing',
      message: 'Playing via custom frame-first clock.',
    });
    void this.runPlaybackLoop(this.playbackRequestId);
  }

  async pause(): Promise<void> {
    this.playbackRequestId += 1;
    this.updateSnapshot({
      status: 'paused',
      message: 'Paused',
    });
  }

  async stop(): Promise<IFramePosition | null> {
    await this.pause();
    return this.seekToFrame(0);
  }

  async setPlaybackRate(rate: PlaybackRate): Promise<void> {
    const currentTimeMs =
      this.snapshot.status === 'playing'
        ? this.currentPlaybackTimestampMs()
        : this.snapshot.currentPosition?.timestampMs ?? 0;

    this.updateSnapshot({
      playbackRate: rate,
      message: `Playback rate set to ${rate}x.`,
    });

    if (this.snapshot.status === 'playing') {
      this.playbackAnchorPerfMs = performance.now();
      this.playbackAnchorTimestampMs = currentTimeMs;
    }
  }

  async stepFrames(delta: number): Promise<IFramePosition | null> {
    if (!this.source) {
      return this.snapshot.currentPosition;
    }

    await this.pause();
    const currentFrameIndex = this.snapshot.currentPosition?.frameIndex ?? 0;
    return this.renderFrameAtIndex(currentFrameIndex + delta, {
      status: 'paused',
      selectedStepSize: Math.abs(delta) >= 10 ? 10 : 1,
      message: 'Stepped frame-first via CanvasSink.',
    });
  }

  async seekToFrame(frameIndex: number): Promise<IFramePosition | null> {
    return this.renderFrameAtIndex(frameIndex, {
      status: this.snapshot.status === 'playing' ? 'playing' : 'paused',
      message: 'Frame seek resolved through shared frame index.',
    });
  }

  async scrubToRatio(ratio: number): Promise<IFramePosition | null> {
    if (!this.source) {
      return this.snapshot.currentPosition;
    }

    return this.renderFrameAtIndex(findFrameIndexForRatio(ratio, this.source.frameIndex), {
      status: 'paused',
      message: 'Scrubbing via CanvasSink getCanvas().',
    });
  }

  getCurrentPosition(): IFramePosition | null {
    return this.snapshot.currentPosition;
  }

  getSelectedStepSize(): 1 | 10 {
    return this.snapshot.selectedStepSize;
  }

  getSnapshot(): ICandidateSnapshot {
    return this.snapshot;
  }

  reportLoadFailure(error: unknown): void {
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
    this.playbackRequestId += 1;
    this.listeners.clear();
  }

  private async togglePlayPause(): Promise<void> {
    if (this.snapshot.status === 'playing') {
      await this.pause();
      return;
    }

    await this.play();
  }

  private currentPlaybackTimestampMs(): number {
    return this.playbackAnchorTimestampMs
      + (performance.now() - this.playbackAnchorPerfMs) * this.snapshot.playbackRate;
  }

  private async runPlaybackLoop(playbackRequestId: number): Promise<void> {
    while (playbackRequestId === this.playbackRequestId && this.snapshot.status === 'playing') {
      if (!this.source) {
        return;
      }

      const targetTimestampMs = this.currentPlaybackTimestampMs();
      if (targetTimestampMs >= this.source.frameIndex.durationMs) {
        await this.stop();
        return;
      }

      const targetFrameIndex = findFrameIndexForTimeMs(targetTimestampMs, this.source.frameIndex);
      if (targetFrameIndex !== this.snapshot.currentPosition?.frameIndex) {
        await this.renderFrameAtIndex(targetFrameIndex, {
          status: 'playing',
          message: 'Playing via custom frame-first clock.',
        });
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }

  private async renderFrameAtIndex(
    frameIndex: number,
    snapshotPatch: Partial<ICandidateSnapshot>,
  ): Promise<IFramePosition | null> {
    if (!this.source || !this.canvasSink) {
      return this.snapshot.currentPosition;
    }

    const targetPosition = positionForFrame(frameIndex, this.source.frameIndex);
    const requestSerial = ++this.renderRequestSerial;
    const wrappedCanvas = await this.canvasSink.getCanvas(targetPosition.timestampMs / 1_000);
    if (!wrappedCanvas || requestSerial !== this.renderRequestSerial) {
      return this.snapshot.currentPosition;
    }

    const renderCanvas = this.panel.getCanvas();
    const context = renderCanvas.getContext('2d');
    if (!context) {
      throw new Error('Candidate B could not get 2D canvas context.');
    }

    context.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    context.drawImage(wrappedCanvas.canvas, 0, 0, renderCanvas.width, renderCanvas.height);

    this.updateSnapshot({
      ...snapshotPatch,
      currentPosition: targetPosition,
    });

    return targetPosition;
  }

  private updateSnapshot(patch: Partial<ICandidateSnapshot>): void {
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
