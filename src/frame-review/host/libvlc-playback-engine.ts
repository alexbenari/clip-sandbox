import { BackendError } from '../model/backend-error.js';
import { FrameReviewWireValue } from '../model/source-frame-identity.js';
import type { NativeProcessClient, ITimedProtocolMessage } from './native-process-client.js';

export interface IPlaybackStatus {
  readonly state: string;
  readonly sourceGeneration: number;
  readonly timestampUs: bigint;
  readonly lengthUs: bigint | null;
  readonly rate: number;
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
}

export interface IPlaybackOpenOptions {
  readonly muted: boolean;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface IReviewPlaybackEngine {
  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined): void;
  open(sourcePath: string, options: IPlaybackOpenOptions): Promise<IPlaybackStatus>;
  play(): Promise<void>;
  playAt(timestampUs: bigint): Promise<void>;
  pause(): Promise<void>;
  setRate(rate: number): Promise<void>;
  seek(timestampUs: bigint): Promise<void>;
  status(): Promise<IPlaybackStatus>;
  shutdown(): Promise<void>;
}

export class LibVlcPlaybackEngine implements IReviewPlaybackEngine {
  private sourceGeneration = 0;
  private listener: ((frame: IHostPlaybackFrame) => void) | undefined;

  constructor(private readonly client: NativeProcessClient) {
    client.setEventHandler((message) => this.onEvent(message));
  }

  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined): void {
    this.listener = listener;
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

  async setRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
      throw new BackendError('invalid-request', 'Playback rate must be between 0.25 and 4.', true);
    }
    await this.client.request('rate', { rate });
  }

  async seek(timestampUs: bigint): Promise<void> {
    if (timestampUs < 0n) throw new BackendError('invalid-request', 'Playback time must not be negative.', true);
    await this.client.request('seek', { timeUs: timestampUs.toString() });
  }

  async status(): Promise<IPlaybackStatus> {
    return this.parseStatus(await this.client.request('status'), this.sourceGeneration);
  }

  shutdown(): Promise<void> { return this.client.shutdown(); }

  private onEvent(message: ITimedProtocolMessage): void {
    if (message.metadata.type !== 'playback-frame') return;
    const sourceGeneration = FrameReviewWireValue.nonnegativeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
    const frameGeneration = FrameReviewWireValue.nonnegativeInteger(message.metadata.frameGeneration, 'frameGeneration');
    if (sourceGeneration !== this.sourceGeneration) return;
    const width = FrameReviewWireValue.nonnegativeInteger(message.metadata.width, 'width');
    const height = FrameReviewWireValue.nonnegativeInteger(message.metadata.height, 'height');
    const stride = FrameReviewWireValue.nonnegativeInteger(message.metadata.stride, 'stride');
    if (message.metadata.pixelFormat !== 'RGBA8888' || width < 1 || height < 1 || stride < width * 4
      || message.payload.length !== stride * height) {
      throw new BackendError('protocol-error', 'LibVLC returned invalid frame pixels.', false);
    }
    this.listener?.(Object.freeze({
      kind: 'playback-frame',
      sourceGeneration,
      frameGeneration,
      playbackTimestampUs: FrameReviewWireValue.decimalBigInt(message.metadata.playbackTimestampUs, 'playbackTimestampUs'),
      width,
      height,
      sourceWidth: FrameReviewWireValue.nonnegativeInteger(message.metadata.sourceWidth, 'sourceWidth'),
      sourceHeight: FrameReviewWireValue.nonnegativeInteger(message.metadata.sourceHeight, 'sourceHeight'),
      pixels: this.packPixels(message.payload, width, height, stride),
    }));
    void this.client.request('frame-ack', { frameGeneration }).catch(() => undefined);
  }

  private parseStatus(message: ITimedProtocolMessage, expectedGeneration: number): IPlaybackStatus {
    const generation = FrameReviewWireValue.nonnegativeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
    if (generation !== expectedGeneration) throw new BackendError('stale-response', 'Playback status is obsolete.', true);
    const rate = message.metadata.rate === undefined ? 1 : Number(message.metadata.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new BackendError('protocol-error', 'Playback rate is invalid.', false);
    return Object.freeze({
      state: String(message.metadata.state),
      sourceGeneration: generation,
      timestampUs: message.metadata.timeUs === undefined
        ? 0n : FrameReviewWireValue.decimalBigInt(message.metadata.timeUs, 'timeUs'),
      lengthUs: message.metadata.lengthUs === undefined
        ? null : FrameReviewWireValue.decimalBigInt(message.metadata.lengthUs, 'lengthUs'),
      rate,
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
