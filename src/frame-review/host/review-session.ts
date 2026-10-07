import type { AdjacentDirection } from '../adjacent-step-scheduler.js';
import { AdjacentStepScheduler } from '../adjacent-step-scheduler.js';
import type { FrameReviewCapturePoint } from '../frame-review-api.js';
import type { ISourceFrameIdentity } from '../model/source-frame-identity.js';
import { SourceFingerprint, type ISourceFingerprint } from '../model/source-fingerprint.js';
import { BackendError } from '../model/backend-error.js';
import { FrameReviewState, type IFrameReviewState } from '../model/frame-review-state.js';
import { ScrubRequestScheduler } from '../scrub-request-scheduler.js';
import type { IExactFrameReader, IHostExactFrame } from './bestsource-frame-reader.js';
import type { IHostPlaybackFrame, IReviewPlaybackEngine } from './libvlc-playback-engine.js';
import type { IExactReviewProxyHostResult, IReviewPreparationUpdate } from './review-preparation-service.js';
import type { IPlaybackProxyEntry } from './playback-proxy-cache.js';
import { ProxyPlaybackClock, type IProxyLoopTimes } from './proxy-playback-clock.js';

export interface IExactPreviewRange {
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
}

type ExactPreview = Readonly<{
  range: IExactPreviewRange;
  times: IProxyLoopTimes;
  phase: 'running' | 'paused';
}>;

export type HostFrameReviewEvent =
  | Readonly<{ type: 'state'; state: IFrameReviewState }>
  | Readonly<{ type: 'display-frame'; frame: IHostExactFrame | IHostPlaybackFrame }>
  | Readonly<{ type: 'playback-ended' }>
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
  private playbackTurn: Promise<void> = Promise.resolve();
  private proxyActivationPromise: Promise<void> | null = null;
  private proxyActivationError: unknown = null;
  private exactReady = false;
  private preparedFingerprint: ISourceFingerprint | null = null;
  private proxyClock: ProxyPlaybackClock | null = null;
  private loopUnavailableReason: string | null = null;
  private preparedProxyPath: string | null = null;
  private preview: ExactPreview | null = null;
  private previewEpoch = 0;
  private abLoopArmed = false;
  private playbackDisabled = false;
  private opened = false;
  private disposed = false;
  private disposalPromise: Promise<void> | null = null;

  constructor(private readonly options: IReviewSessionOptions) {
    this.id = options.id;
    this.scrubScheduler = new ScrubRequestScheduler((frameIndex) => options.exact.scrub(frameIndex), 100);
    this.adjacentScheduler = new AdjacentStepScheduler(
      { stepAdjacent: (direction) => options.exact.stepAdjacent(direction) },
      (frame) => this.rememberFrame(frame),
      (error) => {
        if (error instanceof BackendError && error.category === 'frame-boundary') return;
        this.emitError(error);
      },
    );
    this.adjacentScheduler.setSourceGeneration(1);
    options.playback.setFrameListener((frame) => {
      if (this.disposed || this.currentExactFrame) return;
      options.emit(Object.freeze({
        type: 'display-frame',
        frame: Object.freeze({ ...frame, sourceGeneration: 1 }),
      }));
    });
    options.playback.setEndedListener(() => {
      if (!this.disposed && this.preview?.phase !== 'running') {
        options.emit(Object.freeze({ type: 'playback-ended' }));
      }
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

  captureContext(): Readonly<{ sourcePath: string; fingerprint: ISourceFingerprint }> | null {
    return this.preparedFingerprint
      ? Object.freeze({ sourcePath: this.options.sourcePath, fingerprint: this.preparedFingerprint }) : null;
  }

  async whenPrepared(): Promise<void> { await this.preparationPromise; }

  async play(): Promise<void> {
    this.requireOpen();
    if (this.playbackDisabled) throw new BackendError('invalid-state', 'Playback needs a new review session.', true);
    if (this.preview?.phase === 'running') throw new BackendError('invalid-state', 'Loop preview is running.', true);
    this.preview = null;
    await this.withPlayback(async () => {
      if (this.currentExactFrame) {
        const time = this.proxyClock?.at(this.currentExactFrame.identity.frameIndex)
          ?? this.currentExactFrame.reviewTimeUs;
        await this.options.playback.playAt(time);
      }
      else await this.options.playback.play();
      this.currentExactFrame = null;
    });
  }

  async pause(): Promise<void> {
    this.requireOpen();
    if (this.preview?.phase === 'running') { await this.pauseExactPreview(); return; }
    await this.withPlayback(() => this.options.playback.pause());
  }

  async seekPlayback(timestampUs: bigint): Promise<void> {
    this.requireOpen();
    await this.stopPreviewRule();
    await this.withPlayback(async () => {
      await this.options.playback.seek(timestampUs);
      this.currentExactFrame = null;
    });
  }

  async enterFrameScrub(): Promise<IHostExactFrame> {
    this.requireExactReady();
    if (this.preview?.phase === 'running') return this.pauseExactPreview();
    await this.options.playback.pause();
    const status = await this.options.playback.status();
    return this.rememberFrame(await this.options.exact.atTime(status.timestampUs));
  }

  async scrubToFrame(frameIndex: number): Promise<IHostExactFrame> {
    this.requireExactReady();
    if (this.preview?.phase === 'running') await this.pauseExactPreview();
    if (!this.playbackDisabled) await this.options.playback.pause();
    const frame = this.rememberFrame(await this.scrubScheduler.submit(frameIndex));
    this.retainPreviewIfInRange(frame.identity.frameIndex);
    return frame;
  }

  async stepAdjacent(direction: AdjacentDirection): Promise<IHostExactFrame> {
    this.requireExactReady();
    if (this.preview?.phase === 'running') await this.pauseExactPreview();
    if (!this.playbackDisabled) await this.options.playback.pause();
    const frame = this.rememberFrame(await this.options.exact.stepAdjacent(direction));
    this.retainPreviewIfInRange(frame.identity.frameIndex);
    return frame;
  }

  async pressAdjacent(direction: AdjacentDirection): Promise<void> {
    this.requireExactReady();
    if (this.preview?.phase === 'running') await this.pauseExactPreview();
    if (!this.playbackDisabled) await this.options.playback.pause();
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

  async frameIdentity(frameIndex: number): Promise<ISourceFrameIdentity> {
    this.requireExactReady();
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
      throw new BackendError('invalid-request', 'Frame ordinal is invalid.', true);
    }
    return this.options.exact.identity(frameIndex);
  }

  async thumbnailFrame(frameIndex: number): Promise<IHostExactFrame> {
    this.requireExactReady();
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
      throw new BackendError('invalid-request', 'Thumbnail frame ordinal is invalid.', true);
    }
    return this.options.exact.thumbnail(frameIndex);
  }

  async startExactPreview(range: IExactPreviewRange): Promise<void> {
    this.requireExactReady();
    if (this.playbackDisabled) throw new BackendError('invalid-state', 'Playback needs a new review session.', true);
    const clock = this.requireProxyClock();
    const times = clock.loop(range.startFrameIndex, range.endFrameIndex);
    const epoch = ++this.previewEpoch;
    await this.withPlayback(() => this.activateExactPreview(range, times, range.startFrameIndex, epoch));
  }

  async pauseExactPreview(): Promise<IHostExactFrame> {
    this.requireExactReady();
    const preview = this.preview;
    if (!preview || preview.phase !== 'running') {
      throw new BackendError('invalid-state', 'Loop preview is not running.', true);
    }
    ++this.previewEpoch;
    return this.withPlayback(async () => {
      await this.options.playback.pause();
      const status = await this.options.playback.status();
      const clock = this.requireProxyClock();
      const ordinal = Math.max(preview.range.startFrameIndex,
        Math.min(preview.range.endFrameIndex, clock.atOrBefore(status.timestampUs)));
      const frame = this.rememberFrame(await this.options.exact.scrub(ordinal));
      try {
        await this.options.playback.resetAbLoop();
        this.abLoopArmed = false;
        this.preview = Object.freeze({ ...preview, phase: 'paused' });
      } catch (error) {
        this.preview = null;
        await this.recoverPlaybackAt(ordinal);
        throw error;
      }
      return frame;
    });
  }

  async resumeExactPreview(frameIndex: number): Promise<void> {
    this.requireExactReady();
    const preview = this.preview;
    if (!preview || preview.phase !== 'paused' || frameIndex < preview.range.startFrameIndex
      || frameIndex > preview.range.endFrameIndex || this.currentExactFrame?.identity.frameIndex !== frameIndex) {
      throw new BackendError('invalid-state', 'The paused loop target has changed.', true);
    }
    const epoch = ++this.previewEpoch;
    await this.withPlayback(() => this.activateExactPreview(preview.range, preview.times, frameIndex, epoch));
  }

  async stopExactPreview(): Promise<IHostExactFrame | null> {
    this.requireExactReady();
    if (this.preview?.phase === 'running') {
      const frame = await this.pauseExactPreview();
      this.preview = null;
      return frame;
    }
    this.preview = null;
    ++this.previewEpoch;
    if (this.abLoopArmed) await this.withPlayback(() => this.clearArmedLoop(this.currentExactFrame?.identity.frameIndex ?? 0));
    return this.currentExactFrame;
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.disposed = true;
    ++this.previewEpoch;
    this.preview = null;
    this.abortController.abort();
    this.scrubScheduler.invalidate();
    this.adjacentScheduler.setSourceGeneration(2);
    this.options.playback.setFrameListener(undefined);
    this.options.playback.setEndedListener(undefined);
    this.disposalPromise = Promise.allSettled([
      this.playbackTurn.then(() => this.options.playback.shutdown()),
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
      await this.options.exact.open({
        canonicalSourcePath: prepared.canonicalSourcePath,
        canonicalIndexPath: prepared.canonicalIndexPath,
        maxWidth: this.options.previewBounds.maxWidth,
        maxHeight: this.options.previewBounds.maxHeight,
      });
      if (this.disposed) return;
      if (!this.proxyActivationPromise) {
        await this.withPlayback(async () => {
          const playbackStatus = await this.options.playback.status();
          const wasPlaying = playbackStatus.state === 'playing';
          if (wasPlaying) await this.options.playback.pause();
          await this.options.playback.open(prepared.proxyPath, {
            muted: false,
            maxWidth: this.options.previewBounds.maxWidth,
            maxHeight: this.options.previewBounds.maxHeight,
          });
          await this.options.playback.seek(playbackStatus.timestampUs);
          if (wasPlaying) await this.options.playback.play();
        });
      }
      if (this.disposed) return;
      this.exactReady = true;
      this.preparedProxyPath = prepared.proxyPath;
      this.loopUnavailableReason = prepared.proxyTimelineError;
      if (prepared.proxyTimeline) {
        try { this.proxyClock = new ProxyPlaybackClock(prepared.proxyTimeline); }
        catch (error) {
          this.proxyClock = null;
          this.loopUnavailableReason = error instanceof Error ? error.message : 'Loop timeline is unavailable.';
        }
      }
      this.preparedFingerprint = SourceFingerprint.fromInspection(prepared.identity);
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

  private requireProxyClock(): ProxyPlaybackClock {
    if (!this.proxyClock) throw new BackendError('invalid-state',
      this.loopUnavailableReason ?? 'Loop timeline is unavailable.', true);
    return this.proxyClock;
  }

  private async activateExactPreview(
    range: IExactPreviewRange, times: IProxyLoopTimes, frameIndex: number, epoch: number,
  ): Promise<void> {
    if (epoch !== this.previewEpoch || this.disposed) return;
    try {
      if (this.preview?.phase === 'running') await this.options.playback.pause();
      if (this.abLoopArmed) {
        await this.options.playback.resetAbLoop();
        this.abLoopArmed = false;
      }
      if (epoch !== this.previewEpoch || this.disposed) return;
      await this.options.playback.armAbLoop(times.startUs, times.bUs);
      this.abLoopArmed = true;
      if (epoch !== this.previewEpoch || this.disposed) return;
      await this.options.playback.seek(this.requireProxyClock().at(frameIndex));
      if (epoch !== this.previewEpoch || this.disposed) return;
      this.currentExactFrame = null;
      this.preview = Object.freeze({ range: Object.freeze({ ...range }), times, phase: 'running' });
      await this.options.playback.play();
    } catch (error) {
      this.preview = null;
      await this.clearArmedLoop(frameIndex);
      throw error;
    } finally {
      if ((epoch !== this.previewEpoch || this.disposed) && this.abLoopArmed) {
        this.preview = null;
        await this.clearArmedLoop(frameIndex);
      }
    }
  }

  private async clearArmedLoop(frameIndex: number): Promise<void> {
    try {
      await this.options.playback.pause();
      await this.options.playback.resetAbLoop();
      this.abLoopArmed = false;
    } catch {
      await this.recoverPlaybackAt(frameIndex);
    }
  }

  private retainPreviewIfInRange(frameIndex: number): void {
    if (this.preview?.phase === 'paused' && (frameIndex < this.preview.range.startFrameIndex
      || frameIndex > this.preview.range.endFrameIndex)) this.preview = null;
  }

  private async stopPreviewRule(): Promise<void> {
    if (!this.preview && !this.abLoopArmed) return;
    ++this.previewEpoch;
    const wasRunning = this.preview?.phase === 'running';
    this.preview = null;
    await this.withPlayback(async () => {
      if (wasRunning) await this.options.playback.pause();
      await this.clearArmedLoop(this.currentExactFrame?.identity.frameIndex ?? 0);
    });
  }

  private async recoverPlaybackAt(frameIndex: number): Promise<void> {
    const proxyPath = this.preparedProxyPath;
    if (!proxyPath) { this.playbackDisabled = true; return; }
    try {
      await this.options.playback.open(proxyPath, {
        muted: false,
        maxWidth: this.options.previewBounds.maxWidth,
        maxHeight: this.options.previewBounds.maxHeight,
      });
      this.abLoopArmed = false;
      await this.options.playback.seek(this.requireProxyClock().at(frameIndex));
      await this.options.playback.pause();
    } catch {
      this.playbackDisabled = true;
    }
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
    await this.withPlayback(async () => {
      const playbackStatus = await this.options.playback.status();
      const wasPlaying = playbackStatus.state === 'playing';
      if (wasPlaying) await this.options.playback.pause();
      await this.options.playback.open(proxy.proxyPath, {
        muted: false,
        maxWidth: this.options.previewBounds.maxWidth,
        maxHeight: this.options.previewBounds.maxHeight,
      });
      await this.options.playback.seek(playbackStatus.timestampUs);
      if (wasPlaying) await this.options.playback.play();
    });
  }

  private withPlayback<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.playbackTurn.then(operation);
    this.playbackTurn = result.then(() => undefined, () => undefined);
    return result;
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
