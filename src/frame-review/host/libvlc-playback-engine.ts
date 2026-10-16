import { BackendError } from '../model/backend-error.js';
import { FrameReviewWire } from '../model/source-frame-identity.js';
import type { NativeProcessClient, ITimedProtocolMessage } from './native-process-client.js';

export interface IPlaybackStatus {
  readonly state: string;
  readonly sourceGeneration: number;
  readonly timestampUs: bigint;
  readonly lengthUs: bigint | null;
}

export interface IHostPlaybackFrame {
  readonly kind: 'playback-frame';
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly playbackTimestampUs: bigint;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly pixels: Uint8Array;
  readonly droppedBeforeWrite?: number;
  readonly previousAckRoundTripMs?: number | null;
}

export interface IPlaybackOpenOptions {
  readonly muted: boolean;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface IReviewPlaybackEngine {
  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined): void;
  setEndedListener(listener: (() => void) | undefined): void;
  open(sourcePath: string, options: IPlaybackOpenOptions): Promise<IPlaybackStatus>;
  play(): Promise<void>;
  playAt(timestampUs: bigint): Promise<void>;
  pause(): Promise<void>;
  seek(timestampUs: bigint): Promise<void>;
  armAbLoop(aTimeUs: bigint, bTimeUs: bigint): Promise<void>;
  resetAbLoop(): Promise<void>;
  status(): Promise<IPlaybackStatus>;
  shutdown(): Promise<void>;
}

export class LibVlcPlaybackEngine implements IReviewPlaybackEngine {
  private sourceGeneration = 0;
  private listener: ((frame: IHostPlaybackFrame) => void) | undefined;
  private endedListener: (() => void) | undefined;
  private previousAckRoundTripMs: number | null = null;

  constructor(private readonly client: NativeProcessClient) {
    client.setEventHandler((message) => this.onEvent(message));
  }

  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined): void {
    this.listener = listener;
  }

  setEndedListener(listener: (() => void) | undefined): void {
    this.endedListener = listener;
  }

  async open(sourcePath: string, options: IPlaybackOpenOptions): Promise<IPlaybackStatus> {
    const generation = ++this.sourceGeneration;
    return this.parseStatus(await this.client.request('open', {
      sourcePath,
      sourceGeneration: generation,
      muted: options.muted,
      maxPreviewWidth: options.maxWidth,
      maxPreviewHeight: options.maxHeight,
    }, 60_000), generation);
  }

  async play(): Promise<void> { await this.client.request('play'); }

  async playAt(timestampUs: bigint): Promise<void> {
    if (timestampUs < 0n) throw new BackendError('invalid-request', 'Playback time must not be negative.', true);
    await this.client.request('play-at', { timeUs: timestampUs.toString() });
  }

  async pause(): Promise<void> { await this.client.request('pause'); }

  async seek(timestampUs: bigint): Promise<void> {
    if (timestampUs < 0n) throw new BackendError('invalid-request', 'Playback time must not be negative.', true);
    await this.client.request('seek', { timeUs: timestampUs.toString() });
  }

  async armAbLoop(aTimeUs: bigint, bTimeUs: bigint): Promise<void> {
    if (aTimeUs < 0n || bTimeUs <= aTimeUs || bTimeUs > (1n << 63n) - 1n) {
      throw new BackendError('invalid-request', 'A–B loop times are invalid.', true);
    }
    await this.client.request('arm-ab-loop', { aTimeUs: aTimeUs.toString(), bTimeUs: bTimeUs.toString() });
  }

  async resetAbLoop(): Promise<void> { await this.client.request('reset-ab-loop'); }

  async status(): Promise<IPlaybackStatus> {
    return this.parseStatus(await this.client.request('status'), this.sourceGeneration);
  }

  shutdown(): Promise<void> { return this.client.shutdown(); }

  private onEvent(message: ITimedProtocolMessage): void {
    if (message.metadata.type === 'playback-ended') {
      if (FrameReviewWire.nonnegativeInteger(message.metadata.sourceGeneration, 'sourceGeneration')
        === this.sourceGeneration) this.endedListener?.();
      return;
    }
    if (message.metadata.type !== 'playback-frame') return;
    const sourceGeneration = FrameReviewWire.nonnegativeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
    const frameGeneration = FrameReviewWire.nonnegativeInteger(message.metadata.frameGeneration, 'frameGeneration');
    if (sourceGeneration !== this.sourceGeneration) return;
    const width = FrameReviewWire.nonnegativeInteger(message.metadata.width, 'width');
    const height = FrameReviewWire.nonnegativeInteger(message.metadata.height, 'height');
    const stride = FrameReviewWire.nonnegativeInteger(message.metadata.stride, 'stride');
    if (message.metadata.pixelFormat !== 'RGBA8888' || width < 1 || height < 1 || stride < width * 4
      || message.payload.length !== stride * height) {
      throw new BackendError('protocol-error', 'LibVLC returned invalid frame pixels.', false);
    }
    this.listener?.(Object.freeze({
      kind: 'playback-frame',
      sourceGeneration,
      frameGeneration,
      playbackTimestampUs: FrameReviewWire.decimalBigInt(message.metadata.playbackTimestampUs, 'playbackTimestampUs'),
      width,
      height,
      sourceWidth: FrameReviewWire.nonnegativeInteger(message.metadata.sourceWidth, 'sourceWidth'),
      sourceHeight: FrameReviewWire.nonnegativeInteger(message.metadata.sourceHeight, 'sourceHeight'),
      pixels: this.packPixels(message.payload, width, height, stride),
      droppedBeforeWrite: FrameReviewWire.nonnegativeInteger(
        message.metadata.droppedBeforeWrite, 'droppedBeforeWrite'),
      previousAckRoundTripMs: this.previousAckRoundTripMs,
    }));
    void this.client.request('frame-ack', { frameGeneration }).then(response => {
      this.previousAckRoundTripMs = response.roundTripMs;
    }).catch(() => { this.previousAckRoundTripMs = null; });
  }

  private parseStatus(message: ITimedProtocolMessage, expectedGeneration: number): IPlaybackStatus {
    const generation = FrameReviewWire.nonnegativeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
    if (generation !== expectedGeneration) throw new BackendError('stale-response', 'Playback status is obsolete.', true);
    return Object.freeze({
      state: String(message.metadata.state),
      sourceGeneration: generation,
      timestampUs: message.metadata.timeUs === undefined
        ? 0n : FrameReviewWire.decimalBigInt(message.metadata.timeUs, 'timeUs'),
      lengthUs: message.metadata.lengthUs === undefined
        ? null : FrameReviewWire.decimalBigInt(message.metadata.lengthUs, 'lengthUs'),
    });
  }

  private packPixels(payload: Buffer, width: number, height: number, stride: number): Uint8Array {
    const packedStride = width * 4;
    if (stride === packedStride) return Uint8Array.from(payload);
    const packed = new Uint8Array(packedStride * height);
    for (let row = 0; row < height; row += 1) {
      packed.set(payload.subarray(row * stride, row * stride + packedStride), row * packedStride);
    }
    return packed;
  }
}
