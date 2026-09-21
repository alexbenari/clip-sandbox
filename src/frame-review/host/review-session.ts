import type { AdjacentDirection } from '../adjacent-step-scheduler.js';
import { AdjacentStepScheduler } from '../adjacent-step-scheduler.js';
import type { FrameReviewCapturePoint } from '../frame-review-api.js';
import { BackendError } from '../model/backend-error.js';
import { FrameReviewState, type IFrameReviewState } from '../model/frame-review-state.js';
import { ScrubRequestScheduler } from '../scrub-request-scheduler.js';
import type { IExactFrameReader, IHostExactFrame } from './bestsource-frame-reader.js';
import type { IHostPlaybackFrame, IReviewPlaybackEngine } from './libvlc-playback-engine.js';
import type { IExactReviewProxyHostResult, IReviewPreparationUpdate } from './review-preparation-service.js';
import type { IPlaybackProxyEntry } from './playback-proxy-cache.js';

export type HostFrameReviewEvent =
  | Readonly<{ type: 'state'; state: IFrameReviewState }>
  | Readonly<{ type: 'display-frame'; frame: IHostExactFrame | IHostPlaybackFrame }>
  | Readonly<{ type: 'error'; category: string; message: string; recoverable: boolean }>;

export interface IReviewSessionOptions {
  readonly id: string;
  readonly sourcePath: string;
  readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly playback: IReviewPlaybackEngine;
  readonly exact: IExactFrameReader;
  readonly prepare: (
    sourcePath: string,
    emit: (update: IReviewPreparationUpdate) => void,
    signal?: AbortSignal,
  ) => Promise<IExactReviewProxyHostResult>;
  readonly emit: (event: HostFrameReviewEvent) => void;
}

export class ReviewSession {
  readonly id: string;
  private readonly abortController = new AbortController();
  private readonly scrubScheduler: ScrubRequestScheduler<IHostExactFrame>;
  private readonly adjacentScheduler: AdjacentStepScheduler<IHostExactFrame>;
  private currentState = FrameReviewState.create('opening', 1);
  private playbackDurationUs: bigint | null = null;
  private currentExactFrame: IHostExactFrame | null = null;
  private preparationPromise: Promise<void> = Promise.resolve();
  private proxyActivationPromise: Promise<void> | null = null;
  private proxyActivationError: unknown = null;
  private exactReady = false;
  private opened = false;
  private disposed = false;
  private disposalPromise: Promise<void> | null = null;

  constructor(private readonly options: IReviewSessionOptions) {
    this.id = options.id;
    this.scrubScheduler = new ScrubRequestScheduler((frameIndex) => options.exact.scrub(frameIndex), 100);
    this.adjacentScheduler = new AdjacentStepScheduler(
      { stepAdjacent: (direction) => options.exact.stepAdjacent(direction) },
      (frame) => this.rememberFrame(frame),
      (error) => this.emitError(error),
    );
    this.adjacentScheduler.setSourceGeneration(1);
    options.playback.setFrameListener((frame) => {
      if (this.disposed || this.currentExactFrame) return;
      options.emit(Object.freeze({
        type: 'display-frame',
        frame: Object.freeze({ ...frame, sourceGeneration: 1 }),
      }));
    });
  }

  async open(): Promise<void> {
    if (this.opened) throw new BackendError('invalid-state', 'Frame-review session is already open.', true);
    this.opened = true;
    this.publishState('opening');
    const playbackStatus = await this.options.playback.open(this.options.sourcePath, {
      muted: false,
      maxWidth: this.options.previewBounds.maxWidth,
      maxHeight: this.options.previewBounds.maxHeight,
    });
    this.playbackDurationUs = playbackStatus.lengthUs;
    if (this.disposed) return;
    this.publishState('playback-ready');
    this.preparationPromise = this.prepare();
  }

  state(): IFrameReviewState { return this.currentState; }

  async whenPrepared(): Promise<void> { await this.preparationPromise; }

  async play(): Promise<void> {
    this.requireOpen();
    if (this.currentExactFrame) await this.options.playback.playAt(this.currentExactFrame.reviewTimeUs);
    else await this.options.playback.play();
    this.currentExactFrame = null;
  }

  async pause(): Promise<void> { this.requireOpen(); await this.options.playback.pause(); }
  async setRate(rate: number): Promise<void> { this.requireOpen(); await this.options.playback.setRate(rate); }

  async seekPlayback(timestampUs: bigint): Promise<void> {
    this.requireOpen();
    await this.options.playback.seek(timestampUs);
    this.currentExactFrame = null;
  }

  async enterFrameScrub(): Promise<IHostExactFrame> {
    this.requireExactReady();
    await this.options.playback.pause();
    const status = await this.options.playback.status();
    return this.rememberFrame(await this.options.exact.atTime(status.timestampUs));
  }

  async scrubToFrame(frameIndex: number): Promise<IHostExactFrame> {
    this.requireExactReady();
    await this.options.playback.pause();
    return this.rememberFrame(await this.scrubScheduler.submit(frameIndex));
  }

  async stepAdjacent(direction: AdjacentDirection): Promise<IHostExactFrame> {
    this.requireExactReady();
    await this.options.playback.pause();
    return this.rememberFrame(await this.options.exact.stepAdjacent(direction));
  }

  async pressAdjacent(direction: AdjacentDirection): Promise<void> {
    this.requireExactReady();
    await this.options.playback.pause();
    this.adjacentScheduler.press(direction);
  }

  async releaseAdjacent(direction?: AdjacentDirection): Promise<void> {
    this.adjacentScheduler.release(direction);
  }

  async captureCurrentPoint(): Promise<FrameReviewCapturePoint> {
    this.requireExactReady();
    if (this.currentExactFrame) {
      return Object.freeze({ kind: 'exact-frame', identity: this.currentExactFrame.identity });
    }
    const status = await this.options.playback.status();
    return Object.freeze({ kind: 'playback-timestamp', timestampUs: status.timestampUs });
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.disposed = true;
    this.abortController.abort();
    this.scrubScheduler.invalidate();
    this.adjacentScheduler.setSourceGeneration(2);
    this.options.playback.setFrameListener(undefined);
    this.disposalPromise = Promise.allSettled([
      this.options.playback.shutdown(),
      this.options.exact.shutdown(),
    ]).then(() => { this.publishState('closed'); });
    return this.disposalPromise;
  }

  private async prepare(): Promise<void> {
    try {
      const prepared = await this.options.prepare(
        this.options.sourcePath,
        update => this.reportPreparation(update),
        this.abortController.signal,
      );
      if (this.disposed) return;
      await this.proxyActivationPromise;
      if (this.proxyActivationError) throw this.proxyActivationError;
      const playbackStatus = await this.options.playback.status();
      const wasPlaying = playbackStatus.state === 'playing';
      if (wasPlaying) await this.options.playback.pause();
      await this.options.exact.open({
        canonicalSourcePath: prepared.canonicalSourcePath,
        canonicalIndexPath: prepared.canonicalIndexPath,
        maxWidth: this.options.previewBounds.maxWidth,
        maxHeight: this.options.previewBounds.maxHeight,
      });
      if (!this.proxyActivationPromise) {
        await this.options.playback.open(prepared.proxyPath, {
          muted: false,
          maxWidth: this.options.previewBounds.maxWidth,
          maxHeight: this.options.previewBounds.maxHeight,
        });
        await this.options.playback.seek(playbackStatus.timestampUs);
        await this.options.playback.setRate(playbackStatus.rate);
      }
      if (wasPlaying) await this.options.playback.play();
      if (this.disposed) return;
      this.exactReady = true;
      this.publishState('exact-ready', {
        preparedReview: Object.freeze({
          cacheKey: prepared.cacheKey,
          cacheHit: prepared.cacheHit,
          frameCount: prepared.frameCount,
          sourceWidth: prepared.sourceWidth,
          sourceHeight: prepared.sourceHeight,
          durationUs: BigInt(prepared.durationUs),
        }),
      });
    } catch (error) {
      if (this.disposed || this.abortController.signal.aborted) return;
      this.emitError(error);
      this.publishState('failed', { message: 'Exact frame review could not be prepared.' });
    }
  }

  private rememberFrame(frame: IHostExactFrame): IHostExactFrame {
    if (this.disposed) throw new BackendError('stale-response', 'Frame arrived after session disposal.', true);
    this.currentExactFrame = frame;
    this.options.emit(Object.freeze({ type: 'display-frame', frame }));
    return frame;
  }

  private reportPreparation(update: IReviewPreparationUpdate): void {
    if (this.disposed) return;
    this.publishState(update.phase, { progressPercent: update.progressPercent });
    if (!update.proxy || this.proxyActivationPromise) return;
    this.proxyActivationPromise = this.activateProxy(update.proxy).catch(error => {
      this.proxyActivationError = error;
    });
  }

  private async activateProxy(proxy: IPlaybackProxyEntry): Promise<void> {
    const playbackStatus = await this.options.playback.status();
    const wasPlaying = playbackStatus.state === 'playing';
    if (wasPlaying) await this.options.playback.pause();
    await this.options.playback.open(proxy.proxyPath, {
      muted: false,
      maxWidth: this.options.previewBounds.maxWidth,
      maxHeight: this.options.previewBounds.maxHeight,
    });
    await this.options.playback.seek(playbackStatus.timestampUs);
    await this.options.playback.setRate(playbackStatus.rate);
    if (wasPlaying) await this.options.playback.play();
  }

  private publishState(
    phase: Parameters<typeof FrameReviewState.create>[0],
    details: Parameters<typeof FrameReviewState.create>[2] = {},
  ): void {
    this.currentState = FrameReviewState.create(phase, 1, {
      ...details,
      playbackDurationUs: details.playbackDurationUs ?? this.playbackDurationUs,
    });
    this.options.emit(Object.freeze({ type: 'state', state: this.currentState }));
  }

  private emitError(error: unknown): void {
    const backend = error instanceof BackendError
      ? error : new BackendError('backend-failure', error instanceof Error ? error.message : String(error), false);
    this.options.emit(Object.freeze({
      type: 'error', category: backend.category, message: backend.message, recoverable: backend.recoverable,
    }));
  }

  private requireOpen(): void {
    if (!this.opened || this.disposed) throw new BackendError('invalid-state', 'Frame-review session is closed.', true);
  }

  private requireExactReady(): void {
    this.requireOpen();
    if (!this.exactReady) throw new BackendError('invalid-state', 'Exact review is not ready yet.', true);
  }
}
