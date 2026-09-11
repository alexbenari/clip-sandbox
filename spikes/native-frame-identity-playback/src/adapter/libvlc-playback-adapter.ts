import { BackendError } from '../model/backend-error.js';
import type { IMediaStatus } from '../model/media-status.js';
import { decimalBigInt, safeInteger } from '../model/source-frame-identity.js';
import {
  previewBoundsFields,
  type IPlaybackDisplayFrame,
  type IPreviewBounds,
} from './frame-playback-adapter.js';
import { NativeProcessClient, type ITimedProtocolMessage } from './native-process-client.js';

export class LibVlcPlaybackAdapter {
  #sourceGeneration = 0;
  #listener: ((frame: IPlaybackDisplayFrame) => void) | undefined;

  constructor(private readonly client: NativeProcessClient) {
    this.client.setEventHandler((message) => this.#onEvent(message));
  }

  setFrameListener(listener: ((frame: IPlaybackDisplayFrame) => void) | undefined): void {
    this.#listener = listener;
  }

  async open(sourcePath: string, options: {
    readonly muted?: boolean;
    readonly previewBounds?: IPreviewBounds;
  } = {}): Promise<IMediaStatus> {
    const sourceGeneration = ++this.#sourceGeneration;
    return playbackStatus(await this.client.request('open', {
      sourcePath,
      sourceGeneration,
      muted: options.muted ?? true,
      ...previewBoundsFields(options.previewBounds),
    }), sourceGeneration);
  }

  async close(): Promise<void> {
    ++this.#sourceGeneration;
    await this.client.request('close');
  }

  async primePreview(): Promise<void> { await this.client.request('prime'); }
  async play(): Promise<void> { await this.client.request('play'); }
  async pause(): Promise<void> { await this.client.request('pause'); }
  async stop(): Promise<void> { await this.client.request('stop'); }

  async setRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
      throw new BackendError('invalid-request', 'Playback rate must be between 0.25 and 4.', true);
    }
    await this.client.request('rate', { rate });
  }

  async seekTimeUs(timeUs: bigint): Promise<void> {
    if (timeUs < 0n) throw new BackendError('invalid-request', 'Playback seek time must not be negative.', true);
    await this.client.request('seek', { timeUs: timeUs.toString() });
  }

  async acknowledgeFrame(frameGeneration: number): Promise<void> {
    await this.client.request('frame-ack', {
      frameGeneration: safeInteger(frameGeneration, 'frameGeneration'),
    });
  }

  async status(): Promise<IMediaStatus> {
    return playbackStatus(await this.client.request('status'), this.#sourceGeneration);
  }

  shutdown(): Promise<void> { return this.client.shutdown(); }

  #onEvent(message: ITimedProtocolMessage): void {
    if (message.metadata.type !== 'playback-frame') return;
    const sourceGeneration = safeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
    if (sourceGeneration !== this.#sourceGeneration) return;
    const pixelFormat = message.metadata.pixelFormat;
    if (pixelFormat !== 'RGBA8888') return;
    this.#listener?.(Object.freeze({
      sourceGeneration,
      frameGeneration: safeInteger(message.metadata.frameGeneration, 'frameGeneration'),
      playbackTimestampUs: decimalBigInt(message.metadata.playbackTimestampUs, 'playbackTimestampUs'),
      width: safeInteger(message.metadata.width, 'width'),
      height: safeInteger(message.metadata.height, 'height'),
      sourceWidth: safeInteger(message.metadata.sourceWidth, 'sourceWidth'),
      sourceHeight: safeInteger(message.metadata.sourceHeight, 'sourceHeight'),
      stride: safeInteger(message.metadata.stride, 'stride'),
      pixelFormat,
      pixels: new Uint8Array(message.payload.buffer, message.payload.byteOffset, message.payload.byteLength),
      droppedBeforeWrite: safeInteger(message.metadata.droppedBeforeWrite, 'droppedBeforeWrite'),
      hostReceivedAtMs: message.hostReceivedAtMs,
    }));
  }
}

function playbackStatus(message: ITimedProtocolMessage, expectedGeneration: number): IMediaStatus {
  const sourceGeneration = safeInteger(message.metadata.sourceGeneration, 'sourceGeneration');
  if (sourceGeneration !== expectedGeneration) {
    throw new BackendError('stale-response', 'Playback status belongs to an obsolete source.', true);
  }
  const state = String(message.metadata.state) as IMediaStatus['state'];
  if (!['closed', 'opening', 'playback-ready', 'playing', 'paused', 'stopping', 'stopped', 'failed'].includes(state)) {
    throw new BackendError('protocol-error', 'LibVLC status has an invalid state.', false);
  }
  const timeUs = message.metadata.timeUs;
  const lengthUs = message.metadata.lengthUs;
  const rate = message.metadata.rate;
  return Object.freeze({
    state,
    sourceGeneration,
    frameGeneration: 0,
    ...(timeUs === undefined ? {} : { timeUs: decimalBigInt(timeUs, 'timeUs') }),
    ...(lengthUs === undefined ? {} : { lengthUs: decimalBigInt(lengthUs, 'lengthUs') }),
    ...(rate === undefined ? {} : { rate: finiteRate(rate) }),
  });
}

function finiteRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BackendError('protocol-error', 'Playback rate must be a positive finite number.', false);
  }
  return value;
}
