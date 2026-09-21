import {
  FrameReviewOpaqueId,
  type FrameReviewCapturePoint,
  type FrameReviewDisplayFrame,
  type FrameReviewEvent,
  type FrameReviewSessionId,
  type IExactDisplayFrame,
  type IFrameReviewOpenRequest,
  type IFrameReviewService,
  type IFrameReviewSession,
  type IFrameReviewSourceSelection,
} from '../../frame-review/frame-review-api.js';
import { BackendError, type BackendErrorCategory } from '../../frame-review/model/backend-error.js';
import type { IFrameReviewState } from '../../frame-review/model/frame-review-state.js';
import { PreparedReviewMetadata } from '../../frame-review/model/prepared-review.js';
import { FrameReviewWireValue, SourceFrameIdentity } from '../../frame-review/model/source-frame-identity.js';

interface IWireResponse {
  readonly ok?: boolean;
  readonly operationId?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

export interface IElectronFrameReviewApi {
  chooseSource(): Promise<IWireResponse>;
  open(request: unknown): Promise<IWireResponse>;
  command(sessionId: string, command: string, args?: unknown): Promise<IWireResponse>;
  close(sessionId: string): Promise<IWireResponse>;
  subscribe(listener: (payload: unknown) => void): () => void;
}

type ElectronFrameReviewWindow = Window & {
  clipSandboxDesktop?: { frameReview?: IElectronFrameReviewApi };
};

export class ElectronFrameReviewService implements IFrameReviewService {
  private readonly api: IElectronFrameReviewApi;

  constructor(win: ElectronFrameReviewWindow = window) {
    const api = win.clipSandboxDesktop?.frameReview;
    if (!api || typeof api.chooseSource !== 'function' || typeof api.open !== 'function' || typeof api.command !== 'function'
      || typeof api.close !== 'function' || typeof api.subscribe !== 'function') {
      throw new Error('Electron frame-review API is unavailable.');
    }
    this.api = api;
  }

  async chooseSource(): Promise<IFrameReviewSourceSelection | null> {
    const result = FrameReviewWireValue.record(this.response(await this.api.chooseSource()), 'frame-review source selection');
    if (result.canceled === true) return null;
    if (typeof result.name !== 'string' || result.name.length < 1 || result.name.length > 512) {
      throw new BackendError('protocol-error', 'Selected movie name is invalid.', false);
    }
    return Object.freeze({
      name: result.name,
      sourceHandle: FrameReviewOpaqueId.sourceHandle(result.sourceHandle),
    });
  }

  async open(request: IFrameReviewOpenRequest): Promise<IFrameReviewSession> {
    const response = this.response(await this.api.open({
      sourceHandle: request.sourceHandle,
      previewBounds: request.previewBounds,
    }));
    const result = FrameReviewWireValue.record(response, 'frame-review open result');
    const sessionId = FrameReviewOpaqueId.sessionId(result.sessionId);
    return new ElectronFrameReviewSession(this.api, sessionId, this.state(result.state));
  }

  private response(value: IWireResponse): unknown {
    if (!value || value.ok !== true) throw this.error(value?.error);
    return value.result;
  }

  private error(value: unknown): BackendError {
    const record = FrameReviewWireValue.record(value, 'frame-review error');
    return new BackendError(
      ElectronFrameReviewService.backendCategory(record.category),
      typeof record.message === 'string' ? record.message : 'Frame review failed.',
      record.recoverable === true,
    );
  }

  private state(value: unknown): IFrameReviewState {
    return ElectronFrameReviewSession.parseState(value);
  }

  static backendCategory(value: unknown): BackendErrorCategory {
    const categories: BackendErrorCategory[] = [
      'invalid-request', 'invalid-state', 'frame-boundary', 'unsupported-command', 'backend-failure',
      'cache-unavailable', 'process-crash', 'timeout', 'protocol-error', 'stale-response',
    ];
    return typeof value === 'string' && categories.includes(value as BackendErrorCategory)
      ? value as BackendErrorCategory : 'backend-failure';
  }
}

class ElectronFrameReviewSession implements IFrameReviewSession {
  private readonly listeners = new Set<(event: FrameReviewEvent) => void>();
  private readonly unsubscribeFromWire: () => void;
  private currentState: IFrameReviewState;
  private disposed = false;
  private disposalPromise: Promise<void> | null = null;

  constructor(
    private readonly api: IElectronFrameReviewApi,
    readonly id: FrameReviewSessionId,
    initialState: IFrameReviewState,
  ) {
    this.currentState = initialState;
    this.unsubscribeFromWire = api.subscribe((payload) => this.onWireEvent(payload));
  }

  state(): IFrameReviewState { return this.currentState; }
  play(): Promise<void> { return this.voidCommand('play'); }
  pause(): Promise<void> { return this.voidCommand('pause'); }
  setRate(rate: number): Promise<void> { return this.voidCommand('set-rate', { rate }); }
  seekPlayback(timestampUs: bigint): Promise<void> { return this.voidCommand('seek-playback', { timestampUs: timestampUs.toString() }); }
  enterFrameScrub(): Promise<IExactDisplayFrame> { return this.exactCommand('enter-scrub'); }
  scrubToFrame(frameIndex: number): Promise<IExactDisplayFrame> { return this.exactCommand('scrub-to-frame', { frameIndex }); }
  stepAdjacent(direction: -1 | 1): Promise<IExactDisplayFrame> { return this.exactCommand('step-adjacent', { direction }); }
  pressAdjacent(direction: -1 | 1): Promise<void> { return this.voidCommand('press-adjacent', { direction }); }
  releaseAdjacent(direction?: -1 | 1): Promise<void> {
    return this.voidCommand('release-adjacent', direction === undefined ? {} : { direction });
  }

  async captureCurrentPoint(): Promise<FrameReviewCapturePoint> {
    const result = FrameReviewWireValue.record(await this.command('capture-current-point'), 'capture point');
    if (result.kind === 'exact-frame') {
      return Object.freeze({ kind: 'exact-frame', identity: SourceFrameIdentity.fromWire(result.identity) });
    }
    if (result.kind === 'playback-timestamp') {
      return Object.freeze({
        kind: 'playback-timestamp',
        timestampUs: FrameReviewWireValue.decimalBigInt(result.timestampUs, 'timestampUs'),
      });
    }
    throw new BackendError('protocol-error', 'Frame-review capture point is invalid.', false);
  }

  subscribe(listener: (event: FrameReviewEvent) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.disposed = true;
    this.listeners.clear();
    this.unsubscribeFromWire();
    this.disposalPromise = this.api.close(this.id).then((response) => { this.response(response); });
    return this.disposalPromise;
  }

  private async voidCommand(command: string, args: unknown = {}): Promise<void> { await this.command(command, args); }
  private async exactCommand(command: string, args: unknown = {}): Promise<IExactDisplayFrame> {
    return this.parseFrame(await this.command(command, args), 'exact-frame') as IExactDisplayFrame;
  }

  private async command(command: string, args: unknown = {}): Promise<unknown> {
    if (this.disposed) throw new BackendError('invalid-state', 'Frame-review session is closed.', true);
    return this.response(await this.api.command(this.id, command, args));
  }

  private onWireEvent(value: unknown): void {
    if (this.disposed) return;
    const envelope = FrameReviewWireValue.record(value, 'frame-review event envelope');
    if (envelope.sessionId !== this.id) return;
    const wire = FrameReviewWireValue.record(envelope.event, 'frame-review event');
    let event: FrameReviewEvent;
    if (wire.type === 'state') {
      this.currentState = ElectronFrameReviewSession.parseState(wire.state);
      event = Object.freeze({ type: 'state', state: this.currentState });
    } else if (wire.type === 'display-frame') {
      event = Object.freeze({ type: 'display-frame', frame: this.parseFrame(wire.frame) });
    } else if (wire.type === 'error') {
      event = Object.freeze({
        type: 'error',
        category: String(wire.category),
        message: String(wire.message),
        recoverable: wire.recoverable === true,
      });
    } else {
      return;
    }
    for (const listener of this.listeners) listener(event);
  }

  private parseFrame(value: unknown, expectedKind?: FrameReviewDisplayFrame['kind']): FrameReviewDisplayFrame {
    const frame = FrameReviewWireValue.record(value, 'display frame');
    if (frame.kind !== 'exact-frame' && frame.kind !== 'playback-frame') {
      throw new BackendError('protocol-error', 'Display-frame kind is invalid.', false);
    }
    if (expectedKind && frame.kind !== expectedKind) throw new BackendError('protocol-error', 'Expected an exact frame.', false);
    const width = FrameReviewWireValue.nonnegativeInteger(frame.width, 'width');
    const height = FrameReviewWireValue.nonnegativeInteger(frame.height, 'height');
    if (width < 1 || height < 1 || !(frame.pixels instanceof Uint8Array) || frame.pixels.byteLength !== width * height * 4) {
      throw new BackendError('protocol-error', 'Display-frame pixel payload is invalid.', false);
    }
    const common = {
      sourceGeneration: FrameReviewWireValue.nonnegativeInteger(frame.sourceGeneration, 'sourceGeneration'),
      frameGeneration: FrameReviewWireValue.nonnegativeInteger(frame.frameGeneration, 'frameGeneration'),
      width,
      height,
      sourceWidth: FrameReviewWireValue.nonnegativeInteger(frame.sourceWidth, 'sourceWidth'),
      sourceHeight: FrameReviewWireValue.nonnegativeInteger(frame.sourceHeight, 'sourceHeight'),
      pixels: new Blob([Uint8Array.from(frame.pixels)], { type: 'application/x-rgba' }),
    };
    return frame.kind === 'exact-frame'
      ? Object.freeze({
        ...common,
        kind: 'exact-frame',
        identity: SourceFrameIdentity.fromWire(frame.identity),
        reviewTimeUs: FrameReviewWireValue.decimalBigInt(frame.reviewTimeUs, 'reviewTimeUs'),
      })
      : Object.freeze({
        ...common,
        kind: 'playback-frame',
        playbackTimestampUs: FrameReviewWireValue.decimalBigInt(frame.playbackTimestampUs, 'playbackTimestampUs'),
      });
  }

  private response(value: IWireResponse): unknown {
    if (value?.ok === true) return value.result;
    const error = FrameReviewWireValue.record(value?.error, 'frame-review error');
    throw new BackendError(
      ElectronFrameReviewService.backendCategory(error.category),
      typeof error.message === 'string' ? error.message : 'Frame review failed.',
      error.recoverable === true,
    );
  }

  static parseState(value: unknown): IFrameReviewState {
    const state = FrameReviewWireValue.record(value, 'frame-review state');
    const phases = ['opening', 'playback-ready', 'inspecting', 'cache-validation', 'normalizing', 'indexing',
      'proxy-encoding', 'proxy-indexing', 'validating', 'exact-ready', 'failed', 'closed'] as const;
    if (!phases.includes(state.phase as typeof phases[number]) || typeof state.captureEnabled !== 'boolean') {
      throw new BackendError('protocol-error', 'Frame-review state is invalid.', false);
    }
    const progressPercent = state.progressPercent === null
      ? null : Number(state.progressPercent);
    if (progressPercent !== null && (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100)) {
      throw new BackendError('protocol-error', 'Frame-review progress is invalid.', false);
    }
    return Object.freeze({
      phase: state.phase as typeof phases[number],
      sourceGeneration: FrameReviewWireValue.nonnegativeInteger(state.sourceGeneration, 'sourceGeneration'),
      captureEnabled: state.captureEnabled,
      playbackDurationUs: state.playbackDurationUs === null || state.playbackDurationUs === undefined
        ? null : FrameReviewWireValue.decimalBigInt(state.playbackDurationUs, 'playbackDurationUs'),
      progressPercent,
      message: state.message === null ? null : String(state.message),
      preparedReview: state.preparedReview === null ? null : PreparedReviewMetadata.fromWire(state.preparedReview),
    });
  }
}
