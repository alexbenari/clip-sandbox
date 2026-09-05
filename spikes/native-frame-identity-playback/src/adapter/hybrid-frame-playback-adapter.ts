import type { MediaStatus } from '../model/media-status.js';
import { BestSourceFramePlaybackAdapter } from './bestsource-frame-playback-adapter.js';
import type {
  DisplayFrame,
  FramePlaybackAdapter,
  PlaybackDisplayFrame,
  PreparedSource,
} from './frame-playback-adapter.js';
import { LibVlcPlaybackAdapter } from './libvlc-playback-adapter.js';
import { BackendError } from '../model/backend-error.js';

type PlaybackEngine = Pick<LibVlcPlaybackAdapter,
  'open' | 'close' | 'primePreview' | 'play' | 'pause' | 'stop' | 'setRate' | 'seekTimeUs' | 'status' |
  'setFrameListener' | 'shutdown'>;
type ExactFrameEngine = Pick<BestSourceFramePlaybackAdapter,
  'open' | 'close' | 'getExactFrame' | 'getFrameAtTime' | 'scrubToFrame' | 'stepAdjacent' |
  'status' | 'shutdown'>;

export class HybridFramePlaybackAdapter implements FramePlaybackAdapter {
  #playbackActive = false;
  #pauseInFlight: Promise<void> | null = null;
  #exactReady = false;
  #currentExactFrame: DisplayFrame | null = null;
  #numFrames: number | null = null;

  constructor(
    private readonly playback: PlaybackEngine,
    private readonly exact: ExactFrameEngine,
  ) {}

  setPlaybackFrameListener(listener: ((frame: PlaybackDisplayFrame) => void) | undefined): void {
    this.playback.setFrameListener(listener);
  }

  async open(source: PreparedSource): Promise<MediaStatus> {
    this.#playbackActive = false;
    this.#pauseInFlight = null;
    const playbackSource = source.playbackSourcePath ?? source.reviewAssetPath;
    const [exactStatus] = await Promise.all([
      this.exact.open(source),
      this.playback.open(playbackSource, { previewBounds: source.previewBounds }),
    ]);
    this.#exactReady = true;
    this.#numFrames = exactStatus.numFrames ?? null;
    this.#currentExactFrame = null;
    return exactStatus;
  }

  async openPlaybackSource(sourcePath: string, previewBounds?: PreparedSource['previewBounds']): Promise<MediaStatus> {
    this.#playbackActive = false;
    this.#pauseInFlight = null;
    this.#exactReady = false;
    this.#currentExactFrame = null;
    this.#numFrames = null;
    return this.playback.open(sourcePath, { muted: false, previewBounds });
  }

  async enableExactReview(source: PreparedSource): Promise<MediaStatus> {
    const status = await this.exact.open(source);
    this.#exactReady = true;
    this.#numFrames = status.numFrames ?? null;
    return status;
  }

  async activatePreparedReview(source: PreparedSource): Promise<MediaStatus> {
    const playbackSourcePath = source.playbackSourcePath ?? source.reviewAssetPath;
    const initial = await this.playback.status();
    const wasPlaying = this.#playbackActive || initial.state === 'playing';
    if (wasPlaying) await this.#ensurePaused();
    const frozen = wasPlaying ? await this.playback.status() : initial;
    const frozenTimeUs = frozen.timeUs ?? initial.timeUs ?? 0n;
    const rate = frozen.rate ?? initial.rate ?? 1;
    let playbackSwitchAttempted = false;
    try {
      const status = await this.exact.open(source);
      const landing = await this.exact.getFrameAtTime(frozenTimeUs);
      playbackSwitchAttempted = true;
      await this.playback.open(playbackSourcePath, { muted: false, previewBounds: source.previewBounds });
      if (!wasPlaying) await this.playback.primePreview();
      await this.playback.seekTimeUs(landing.reviewTimeUs);
      await this.playback.setRate(rate);
      if (wasPlaying) await this.playback.play();
      this.#playbackActive = wasPlaying;
      this.#exactReady = true;
      this.#numFrames = status.numFrames ?? null;
      this.#currentExactFrame = null;
      return status;
    } catch (error) {
      this.#exactReady = false;
      try {
        await this.#restoreProvisionalPlayback(
          source, frozenTimeUs, rate, wasPlaying, playbackSwitchAttempted);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Prepared review activation failed and provisional playback could not be restored.',
        );
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await Promise.all([this.playback.close(), this.exact.close()]);
    } finally {
      this.#playbackActive = false;
      this.#pauseInFlight = null;
      this.#exactReady = false;
      this.#currentExactFrame = null;
      this.#numFrames = null;
    }
  }

  async play(): Promise<void> {
    if (this.#playbackActive && !this.#currentExactFrame) return;
    await this.#ensurePaused();
    if (this.#currentExactFrame) {
      await this.playback.seekTimeUs(this.#currentExactFrame.reviewTimeUs);
      this.#currentExactFrame = null;
    }
    await this.playback.play();
    this.#playbackActive = true;
  }

  async primePreview(): Promise<void> {
    await this.playback.primePreview();
    this.#playbackActive = false;
  }

  pause(): Promise<void> { return this.#ensurePaused(); }

  async stop(): Promise<void> {
    await this.playback.stop();
    this.#playbackActive = false;
  }

  setRate(rate: number): Promise<void> { return this.playback.setRate(rate); }

  async getExactFrame(frameIndex: number): Promise<DisplayFrame> {
    await this.#ensurePaused();
    return this.#remember(await this.exact.getExactFrame(frameIndex));
  }

  async scrubToFrame(frameIndex: number): Promise<DisplayFrame> {
    await this.#ensurePaused();
    return this.#remember(await this.exact.scrubToFrame(frameIndex));
  }

  async stepAdjacent(direction: -1 | 1): Promise<DisplayFrame> {
    await this.#ensurePaused();
    try {
      return this.#remember(await this.exact.stepAdjacent(direction));
    } catch (error) {
      if (error instanceof BackendError && error.category === 'frame-boundary' && this.#currentExactFrame) {
        return this.#currentExactFrame;
      }
      throw error;
    }
  }

  async enterExactAtCurrentPlaybackTime(): Promise<DisplayFrame> {
    if (!this.#exactReady) throw new Error('Exact review preparation has not completed.');
    await this.#ensurePaused();
    const status = await this.playback.status();
    return this.#remember(await this.exact.getFrameAtTime(status.timeUs ?? 0n));
  }

  async captureCurrentFrame(): Promise<DisplayFrame> {
    if (!this.#exactReady) throw new Error('Exact review preparation has not completed.');
    if (!this.#playbackActive && this.#currentExactFrame) return this.#currentExactFrame;
    const status = await this.playback.status();
    return this.exact.getFrameAtTime(status.timeUs ?? 0n);
  }

  async stepFrames(direction: -1 | 1, count: number): Promise<DisplayFrame> {
    if (!this.#exactReady) throw new Error('Exact review preparation has not completed.');
    if (!Number.isSafeInteger(count) || count < 1 || count > 1_000) {
      throw new BackendError('invalid-request', 'Frame step count must be an integer between 1 and 1000.', true);
    }
    if (!this.#currentExactFrame) await this.enterExactAtCurrentPlaybackTime();
    if (count === 1) return this.stepAdjacent(direction);
    const current = this.#currentExactFrame?.identity.frameIndex ?? 0;
    const upper = this.#numFrames === null ? Number.MAX_SAFE_INTEGER : Math.max(0, this.#numFrames - 1);
    return this.getExactFrame(Math.min(upper, Math.max(0, current + direction * count)));
  }

  playbackStatus(): Promise<MediaStatus> { return this.playback.status(); }

  seekPlaybackTimeUs(timeUs: bigint): Promise<void> { return this.playback.seekTimeUs(timeUs); }

  status(): Promise<MediaStatus> { return this.exact.status(); }

  async shutdown(): Promise<void> {
    await Promise.all([this.playback.shutdown(), this.exact.shutdown()]);
  }

  #remember(frame: DisplayFrame): DisplayFrame {
    this.#currentExactFrame = frame;
    return frame;
  }

  async #ensurePaused(): Promise<void> {
    if (!this.#playbackActive && !this.#pauseInFlight) return;
    if (!this.#pauseInFlight) {
      this.#pauseInFlight = this.playback.pause()
        .then(() => { this.#playbackActive = false; })
        .finally(() => { this.#pauseInFlight = null; });
    }
    await this.#pauseInFlight;
  }

  async #restoreProvisionalPlayback(
    source: PreparedSource,
    timeUs: bigint,
    rate: number,
    wasPlaying: boolean,
    playbackSwitchAttempted: boolean,
  ): Promise<void> {
    if (playbackSwitchAttempted && source.fallbackPlaybackSourcePath) {
      await this.playback.open(source.fallbackPlaybackSourcePath, {
        muted: false,
        previewBounds: source.previewBounds,
      });
      if (!wasPlaying) await this.playback.primePreview();
      await this.playback.seekTimeUs(timeUs);
      await this.playback.setRate(rate);
    }
    if (wasPlaying) await this.playback.play();
    this.#playbackActive = wasPlaying;
  }
}
