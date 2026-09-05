import { BackendError } from '../model/backend-error.js';
import type { MediaStatus } from '../model/media-status.js';
import {
  decimalBigInt,
  objectRecord,
  safeInteger,
  sourceFrameIdentityFromWire,
} from '../model/source-frame-identity.js';
import {
  previewBoundsFields,
  type DisplayFrame,
  type FramePlaybackAdapter,
  type PreparedSource,
} from './frame-playback-adapter.js';
import { LatestFrameMailbox } from './latest-frame-mailbox.js';
import { NativeProcessClient, type TimedProtocolMessage } from './native-process-client.js';
import { ProgressiveFrameMailbox } from './progressive-frame-mailbox.js';
import { ScrubRequestScheduler } from './scrub-request-scheduler.js';

export interface BestSourceAdapterOptions {
  readonly scrubDebounceMs?: number;
  readonly scrubDelivery?: 'settled' | 'progressive';
}

export class BestSourceFramePlaybackAdapter implements FramePlaybackAdapter {
  #sourceGeneration = 0;
  readonly #scrubMailbox: LatestFrameMailbox<number, DisplayFrame>;
  readonly #scrubScheduler: ScrubRequestScheduler<DisplayFrame>;
  readonly #progressiveScrubMailbox: ProgressiveFrameMailbox<number, DisplayFrame>;
  readonly #scrubDelivery: 'settled' | 'progressive';

  constructor(private readonly client: NativeProcessClient, options: BestSourceAdapterOptions = {}) {
    this.#scrubMailbox = new LatestFrameMailbox((frameIndex) => this.#requestFrame('scrub', { frameIndex }));
    this.#scrubScheduler = new ScrubRequestScheduler(
      (frameIndex) => this.#scrubMailbox.submit(frameIndex), options.scrubDebounceMs ?? 100);
    this.#progressiveScrubMailbox = new ProgressiveFrameMailbox(
      (frameIndex) => this.#requestFrame('scrub', { frameIndex }));
    this.#scrubDelivery = options.scrubDelivery ?? 'settled';
  }

  async open(source: PreparedSource): Promise<MediaStatus> {
    this.#scrubScheduler.invalidate();
    this.#scrubMailbox.invalidate();
    this.#progressiveScrubMailbox.invalidate();
    const sourceGeneration = ++this.#sourceGeneration;
    const response = await this.client.request('open', {
      sourcePath: source.reviewAssetPath,
      indexPath: source.indexPath,
      ...(source.identitySource ? {
        identitySourcePath: source.identitySource.reviewAssetPath,
        identityIndexPath: source.identitySource.indexPath,
      } : {}),
      sourceGeneration,
      ...previewBoundsFields(source.previewBounds),
    }, 60_000);
    return statusFrom(response, sourceGeneration);
  }

  async close(): Promise<void> {
    this.#scrubScheduler.invalidate();
    this.#scrubMailbox.invalidate();
    this.#progressiveScrubMailbox.invalidate();
    ++this.#sourceGeneration;
    await this.client.request('close');
  }

  async play(): Promise<void> { throw unsupported(); }
  async pause(): Promise<void> { throw unsupported(); }
  async stop(): Promise<void> { throw unsupported(); }
  async setRate(_rate: number): Promise<void> { throw unsupported(); }

  getExactFrame(frameIndex: number): Promise<DisplayFrame> {
    return this.#requestFrame('exact', { frameIndex });
  }

  get progressiveQueueDepth(): number {
    return this.#progressiveScrubMailbox.queuedCount;
  }

  scrubToFrame(frameIndex: number): Promise<DisplayFrame> {
    return this.#scrubDelivery === 'progressive'
      ? this.#progressiveScrubMailbox.submit(frameIndex)
      : this.#scrubScheduler.submit(frameIndex);
  }

  getFrameAtTime(timeUs: bigint): Promise<DisplayFrame> {
    if (timeUs < 0n) {
      return Promise.reject(new BackendError('invalid-request', 'Frame lookup time must not be negative.', true));
    }
    return this.#requestFrame('time', { timeUs: timeUs.toString() });
  }

  stepAdjacent(direction: -1 | 1): Promise<DisplayFrame> {
    return this.#requestFrame('step', { direction });
  }

  async status(): Promise<MediaStatus> {
    return statusFrom(await this.client.request('status'), this.#sourceGeneration);
  }

  shutdown(): Promise<void> {
    this.#scrubScheduler.invalidate();
    this.#scrubMailbox.invalidate();
    this.#progressiveScrubMailbox.invalidate();
    return this.client.shutdown();
  }

  async #requestFrame(command: 'exact' | 'scrub' | 'step' | 'time', fields: Readonly<Record<string, unknown>>): Promise<DisplayFrame> {
    const requestedGeneration = this.#sourceGeneration;
    const response = await this.client.request(command, fields);
    const metadata = response.metadata;
    const sourceGeneration = safeInteger(metadata.sourceGeneration, 'sourceGeneration');
    if (sourceGeneration !== requestedGeneration) {
      throw new BackendError('stale-response', 'Frame belongs to an obsolete source generation.', true);
    }
    const timings = objectRecord(metadata.timings, 'frame timings');
    const reviewTime = objectRecord(metadata.reviewTime, 'review frame time');
    const reviewPts = decimalBigInt(reviewTime.pts, 'review frame PTS');
    const reviewTimebaseNumerator = decimalBigInt(
      reviewTime.timebaseNumerator, 'review frame timebase numerator');
    const reviewTimebaseDenominator = decimalBigInt(
      reviewTime.timebaseDenominator, 'review frame timebase denominator');
    if (reviewTimebaseNumerator <= 0n || reviewTimebaseDenominator <= 0n) {
      throw new BackendError('protocol-error', 'Review frame timebase must be positive.', false);
    }
    return Object.freeze({
      identity: sourceFrameIdentityFromWire(metadata.identity),
      reviewTimeUs: reviewPts * reviewTimebaseNumerator * 1_000_000n / reviewTimebaseDenominator,
      sourceGeneration,
      frameGeneration: safeInteger(metadata.frameGeneration, 'frameGeneration'),
      width: safeInteger(metadata.width, 'width'),
      height: safeInteger(metadata.height, 'height'),
      sourceWidth: safeInteger(metadata.sourceWidth, 'sourceWidth'),
      sourceHeight: safeInteger(metadata.sourceHeight, 'sourceHeight'),
      stride: safeInteger(metadata.stride, 'stride'),
      pixelFormat: pixelFormat(metadata.pixelFormat),
      pixels: new Uint8Array(response.payload.buffer, response.payload.byteOffset, response.payload.byteLength),
      timings: Object.freeze({
        decodeMs: finite(timings.decodeMs, 'decodeMs'),
        conversionMs: finite(timings.conversionMs, 'conversionMs'),
        serviceBeforeWriteMs: finite(timings.serviceBeforeWriteMs, 'serviceBeforeWriteMs'),
        nativeRoundTripMs: response.roundTripMs,
        nativeToHostMs: Math.max(0, response.roundTripMs - finite(timings.serviceBeforeWriteMs, 'serviceBeforeWriteMs')),
      }),
    });
  }
}

function statusFrom(response: TimedProtocolMessage, expectedGeneration: number): MediaStatus {
  const sourceGeneration = safeInteger(response.metadata.sourceGeneration, 'sourceGeneration');
  if (sourceGeneration !== expectedGeneration) {
    throw new BackendError('stale-response', 'Status belongs to an obsolete source generation.', true);
  }
  const value = response.metadata.state;
  if (!['closed', 'opening', 'playback-ready', 'exact-ready', 'playing', 'paused',
    'stopping', 'stopped', 'failed'].includes(String(value))) {
    throw new BackendError('protocol-error', 'Native status has an invalid state.', false);
  }
  const numFrames = response.metadata.numFrames;
  return Object.freeze({
    state: value as MediaStatus['state'],
    sourceGeneration,
    frameGeneration: safeInteger(response.metadata.frameGeneration ?? 0, 'frameGeneration'),
    ...(numFrames === undefined ? {} : { numFrames: safeInteger(numFrames, 'numFrames') }),
  });
}

function pixelFormat(value: unknown): 'RGBA8888' {
  if (value !== 'RGBA8888') throw new BackendError('protocol-error', 'Unsupported pixel format.', false);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BackendError('protocol-error', `${label} must be a nonnegative finite number.`, false);
  }
  return value;
}

function unsupported(): BackendError {
  return new BackendError('unsupported-command', 'BestSource adapter does not own clocked playback.', true);
}
