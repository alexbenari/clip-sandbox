import { BackendError } from '../model/backend-error.js';
import { FrameReviewWire, SourceFrameIdentity, type ISourceFrameIdentity } from '../model/source-frame-identity.js';
import type { NativeProcessClient, ITimedProtocolMessage } from './native-process-client.js';

export interface IHostExactFrame {
  readonly kind: 'exact-frame';
  readonly identity: ISourceFrameIdentity;
  readonly reviewTimeUs: bigint;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly pixels: Uint8Array;
}

export interface IExactFrameOpenRequest {
  readonly canonicalSourcePath: string;
  readonly canonicalIndexPath: string;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface IExactFrameReader {
  open(request: IExactFrameOpenRequest): Promise<number>;
  identity(frameIndex: number): Promise<ISourceFrameIdentity>;
  thumbnail(frameIndex: number): Promise<IHostExactFrame>;
  exact(frameIndex: number): Promise<IHostExactFrame>;
  atTime(timestampUs: bigint): Promise<IHostExactFrame>;
  scrub(frameIndex: number): Promise<IHostExactFrame>;
  stepAdjacent(direction: -1 | 1): Promise<IHostExactFrame>;
  shutdown(): Promise<void>;
}

export class BestSourceFrameReader implements IExactFrameReader {
  private sourceGeneration = 0;

  constructor(private readonly client: NativeProcessClient) {}

  async open(request: IExactFrameOpenRequest): Promise<number> {
    const generation = ++this.sourceGeneration;
    const response = await this.client.request('open', {
      sourcePath: request.canonicalSourcePath,
      indexPath: request.canonicalIndexPath,
      identitySourcePath: request.canonicalSourcePath,
      identityIndexPath: request.canonicalIndexPath,
      sourceGeneration: generation,
      maxPreviewWidth: request.maxWidth,
      maxPreviewHeight: request.maxHeight,
    }, 60_000);
    this.assertGeneration(response, generation);
    return FrameReviewWire.nonnegativeInteger(response.metadata.numFrames, 'numFrames');
  }

  exact(frameIndex: number): Promise<IHostExactFrame> { return this.frame('exact', { frameIndex }); }
  thumbnail(frameIndex: number): Promise<IHostExactFrame> { return this.frame('thumbnail', { frameIndex }); }
  async identity(frameIndex: number): Promise<ISourceFrameIdentity> {
    const generation = this.sourceGeneration;
    const response = await this.client.request('identity', { frameIndex });
    this.assertGeneration(response, generation);
    return SourceFrameIdentity.fromWire(response.metadata.identity);
  }
  scrub(frameIndex: number): Promise<IHostExactFrame> { return this.frame('scrub', { frameIndex }); }
  atTime(timestampUs: bigint): Promise<IHostExactFrame> { return this.frame('time', { timeUs: timestampUs.toString() }); }
  stepAdjacent(direction: -1 | 1): Promise<IHostExactFrame> { return this.frame('step', { direction }); }
  shutdown(): Promise<void> { return this.client.shutdown(); }

  private async frame(command: string, fields: Readonly<Record<string, unknown>>): Promise<IHostExactFrame> {
    const generation = this.sourceGeneration;
    const response = await this.client.request(command, fields);
    this.assertGeneration(response, generation);
    const width = FrameReviewWire.nonnegativeInteger(response.metadata.width, 'width');
    const height = FrameReviewWire.nonnegativeInteger(response.metadata.height, 'height');
    const stride = FrameReviewWire.nonnegativeInteger(response.metadata.stride, 'stride');
    if (response.metadata.pixelFormat !== 'RGBA8888' || width < 1 || height < 1 || stride < width * 4
      || response.payload.length !== stride * height) {
      throw new BackendError('protocol-error', 'BestSource returned invalid frame pixels.', false);
    }
    const reviewTime = FrameReviewWire.record(response.metadata.reviewTime, 'reviewTime');
    const pts = FrameReviewWire.decimalBigInt(reviewTime.pts, 'reviewTime.pts');
    const numerator = FrameReviewWire.decimalBigInt(reviewTime.timebaseNumerator, 'reviewTime.timebaseNumerator');
    const denominator = FrameReviewWire.decimalBigInt(reviewTime.timebaseDenominator, 'reviewTime.timebaseDenominator');
    if (numerator <= 0n || denominator <= 0n) throw new BackendError('protocol-error', 'Review timebase is invalid.', false);
    return Object.freeze({
      kind: 'exact-frame',
      identity: SourceFrameIdentity.fromWire(response.metadata.identity),
      reviewTimeUs: pts * numerator * 1_000_000n / denominator,
      sourceGeneration: generation,
      frameGeneration: FrameReviewWire.nonnegativeInteger(response.metadata.frameGeneration, 'frameGeneration'),
      width,
      height,
      sourceWidth: FrameReviewWire.nonnegativeInteger(response.metadata.sourceWidth, 'sourceWidth'),
      sourceHeight: FrameReviewWire.nonnegativeInteger(response.metadata.sourceHeight, 'sourceHeight'),
      pixels: Uint8Array.from(response.payload),
    });
  }

  private assertGeneration(response: ITimedProtocolMessage, expected: number): void {
    const generation = FrameReviewWire.nonnegativeInteger(response.metadata.sourceGeneration, 'sourceGeneration');
    if (generation !== expected) throw new BackendError('stale-response', 'Exact frame response is obsolete.', true);
  }
}
