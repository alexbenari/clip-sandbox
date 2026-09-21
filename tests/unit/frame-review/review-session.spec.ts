import { describe, expect, it, vi } from 'vitest';

import type { IHostExactFrame, IExactFrameReader } from '../../../src/frame-review/host/bestsource-frame-reader.js';
import type {
  IHostPlaybackFrame,
  IPlaybackOpenOptions,
  IPlaybackStatus,
  IReviewPlaybackEngine,
} from '../../../src/frame-review/host/libvlc-playback-engine.js';
import type { IExactReviewProxyHostResult, IReviewPreparationUpdate } from '../../../src/frame-review/host/review-preparation-service.js';
import { ReviewSession } from '../../../src/frame-review/host/review-session.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

const exactFrame: IHostExactFrame = Object.freeze({
  kind: 'exact-frame',
  identity: Object.freeze({
    frameIndex: 2, originalFrameIndex: 2, pts: 2000n, duration: 1000n,
    timebaseNumerator: 1n, timebaseDenominator: 1000n, frameInfoPts: 2000n, frameInfoHash: 'hash',
  }),
  reviewTimeUs: 2_000_000n,
  sourceGeneration: 1,
  frameGeneration: 1,
  width: 64,
  height: 48,
  sourceWidth: 64,
  sourceHeight: 48,
  pixels: new Uint8Array(64 * 48 * 4),
});

const prepared: IExactReviewProxyHostResult = Object.freeze({
  cacheKey: 'a'.repeat(64), cacheHit: false,
  canonicalIndexPath: 'C:/cache/canonical-index', proxyPath: 'C:/cache/proxy.mkv',
  proxyIndexPath: 'C:/cache/proxy-index', frameMapPath: 'C:/cache/frame-map.json',
  manifestPath: 'C:/cache/manifest.json', frameCount: 4, sourceWidth: 64, sourceHeight: 48,
  durationUs: '4000000', normalizedSourcePath: null, canonicalSourcePath: 'C:/movie.mp4',
  sourcePath: 'C:/movie.mp4', selectedStream: 0,
  identity: Object.freeze({
    schemaVersion: 1, sourceSampleDigest: 'digest', sourceBytes: '1', sourceDurationUs: '4000000',
    signatureProfileVersion: 'sample-signature-compact-v1', preparationContractVersion: 'prepared-review-v1',
    selectedStream: 0, streamMetadataDigest: 'stream', nativeProtocolVersion: 1,
    bestSourceVersion: 'bestsource', ffmpegVersion: 'ffmpeg',
    proxyProfileId: 'mpeg4-gop1-q5-960-source-clock-aac-v1',
    frameMapVersion: 'ordinal-identity-v1',
    indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268435456 }),
  }),
});

class PlaybackFake implements IReviewPlaybackEngine {
  listener: ((frame: IHostPlaybackFrame) => void) | undefined;
  timestampUs = 1_500_000n;
  stateValue = 'paused';
  rate = 1;
  shutdownCount = 0;
  readonly requestedRates: number[] = [];
  readonly requestedPlayAtTimes: bigint[] = [];
  readonly openedPaths: string[] = [];
  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined) { this.listener = listener; }
  async open(path: string, _options: IPlaybackOpenOptions) { this.openedPaths.push(path); return this.status(); }
  async play() { this.stateValue = 'playing'; }
  async playAt(timestampUs: bigint) {
    this.requestedPlayAtTimes.push(timestampUs);
    this.timestampUs = timestampUs;
    this.stateValue = 'playing';
  }
  async pause() { this.stateValue = 'paused'; }
  async setRate(rate: number) { this.rate = rate; this.requestedRates.push(rate); }
  async seek(timestampUs: bigint) { this.timestampUs = timestampUs; }
  async status(): Promise<IPlaybackStatus> {
    return { state: this.stateValue, sourceGeneration: 1, timestampUs: this.timestampUs, lengthUs: 4_000_000n, rate: this.rate };
  }
  async shutdown() { this.shutdownCount += 1; }
}

class ExactFake implements IExactFrameReader {
  shutdownCount = 0;
  async open() { return 4; }
  async exact() { return exactFrame; }
  async atTime() { return exactFrame; }
  async scrub() { return exactFrame; }
  async stepAdjacent() { return exactFrame; }
  async shutdown() { this.shutdownCount += 1; }
}

describe('review session', () => {
  it('keeps playback capture inexact until preparation enables canonical scrub capture', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    const events: unknown[] = [];
    const session = new ReviewSession({
      id: 'session_12345678',
      sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 },
      playback,
      exact,
      prepare: (_path: string, _emit: (update: IReviewPreparationUpdate) => void) => preparation.promise,
      emit: (event) => events.push(event),
    });

    await session.open();
    expect(session.state()).toMatchObject({ phase: 'playback-ready', playbackDurationUs: 4_000_000n });
    await expect(session.captureCurrentPoint()).rejects.toMatchObject({ category: 'invalid-state' });

    preparation.resolve(prepared);
    await session.whenPrepared();
    expect(session.state()).toMatchObject({ phase: 'exact-ready', captureEnabled: true, playbackDurationUs: 4_000_000n });
    await expect(session.captureCurrentPoint()).resolves.toEqual({
      kind: 'playback-timestamp', timestampUs: 1_500_000n,
    });
    await session.enterFrameScrub();
    await expect(session.captureCurrentPoint()).resolves.toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 2 } });

    await session.play();
    await expect(session.captureCurrentPoint()).resolves.toMatchObject({ kind: 'playback-timestamp' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'state' }));
  });

  it('disposes idempotently and suppresses late preparation', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    const emit = vi.fn();
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, playback, exact,
      prepare: () => preparation.promise, emit,
    });
    await session.open();
    await Promise.all([session.dispose(), session.dispose()]);
    preparation.resolve(prepared);
    await session.whenPrepared();
    expect(playback.shutdownCount).toBe(1);
    expect(exact.shutdownCount).toBe(1);
    expect(session.state().phase).toBe('closed');
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ phase: 'exact-ready' }) }));
  });

  it('switches to the review proxy before canonical exact-frame review is ready', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const playback = new PlaybackFake();
    let report: ((update: IReviewPreparationUpdate) => void) | undefined;
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, playback, exact: new ExactFake(),
      prepare: (_path, emit) => { report = emit; return preparation.promise; }, emit: () => undefined,
    });

    await session.open();
    report?.({
      phase: 'proxy-ready', progressPercent: null,
      proxy: { cacheKey: 'a'.repeat(64), cacheHit: false, proxyPath: 'C:/early/proxy.mkv', normalizedSourcePath: null },
    });
    await vi.waitFor(() => expect(playback.openedPaths).toContain('C:/early/proxy.mkv'));
    expect(session.state()).toMatchObject({ phase: 'proxy-ready', captureEnabled: false });

    preparation.resolve(prepared);
    await session.whenPrepared();
    expect(session.state()).toMatchObject({ phase: 'exact-ready', captureEnabled: true });
  });

  it('keeps the selected rate through exact scrubbing and playback resume', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: () => undefined,
    });
    await session.open();
    await session.whenPrepared();

    await session.setRate(4);
    await session.enterFrameScrub();
    await session.play();

    expect(playback.requestedRates).toEqual([1, 4]);
    expect(playback.rate).toBe(4);
  });

  it('resumes playback from the last exact scrub frame instead of the prior playback timestamp', async () => {
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    exact.scrub = async () => Object.freeze({ ...exactFrame, reviewTimeUs: 2_750_000n });
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, playback, exact,
      prepare: async () => prepared, emit: () => undefined,
    });
    await session.open();
    await session.whenPrepared();

    await session.scrubToFrame(3);
    playback.listener?.(Object.freeze({
      kind: 'playback-frame', sourceGeneration: 1, frameGeneration: 2, playbackTimestampUs: 1_951_000n,
      width: 64, height: 48, sourceWidth: 64, sourceHeight: 48, pixels: new Uint8Array(64 * 48 * 4),
    }));
    await session.play();

    expect(playback.requestedPlayAtTimes).toEqual([2_750_000n]);
    expect(playback.timestampUs).toBe(2_750_000n);
    expect(playback.stateValue).toBe('playing');
  });
});
