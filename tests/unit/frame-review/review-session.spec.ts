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
import { BackendError } from '../../../src/frame-review/model/backend-error.js';

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
  proxyTimeline: null, proxyTimelineError: null,
  identity: Object.freeze({
    schemaVersion: 1, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '1', sourceDurationUs: '4000000',
    signatureProfileVersion: 'sample-signature-compact-v1', preparationContractVersion: 'prepared-review-v1',
    selectedStream: 0, streamMetadataDigest: 'b'.repeat(64), nativeProtocolVersion: 1,
    bestSourceVersion: 'bestsource', ffmpegVersion: 'ffmpeg',
    proxyProfileId: 'mpeg4-gop1-q5-960-source-clock-aac-v1',
    frameMapVersion: 'ordinal-identity-v1',
    indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268435456 }),
  }),
});

class PlaybackFake implements IReviewPlaybackEngine {
  listener: ((frame: IHostPlaybackFrame) => void) | undefined;
  endedListener: (() => void) | undefined;
  timestampUs = 1_500_000n;
  stateValue = 'paused';
  shutdownCount = 0;
  readonly requestedPlayAtTimes: bigint[] = [];
  readonly openedPaths: string[] = [];
  readonly openedSound: string[] = [];
  readonly loopCalls: string[] = [];
  failReset = false;
  failRecovery = false;
  setFrameListener(listener: ((frame: IHostPlaybackFrame) => void) | undefined) { this.listener = listener; }
  setEndedListener(listener: (() => void) | undefined) { this.endedListener = listener; }
  async open(path: string, options: IPlaybackOpenOptions) {
    if (this.failRecovery && this.openedPaths.length > 0) throw new Error('reopen failed');
    this.openedPaths.push(path);
    this.openedSound.push(`${path}:${options.muted ? 'muted' : 'sound'}`);
    return this.status();
  }
  async play() { this.stateValue = 'playing'; }
  async playAt(timestampUs: bigint) {
    this.requestedPlayAtTimes.push(timestampUs);
    this.timestampUs = timestampUs;
    this.stateValue = 'playing';
  }
  async pause() { this.stateValue = 'paused'; }
  async seek(timestampUs: bigint) { this.loopCalls.push(`seek:${timestampUs}`); this.timestampUs = timestampUs; }
  async armAbLoop(aTimeUs: bigint, bTimeUs: bigint) { this.loopCalls.push(`arm:${aTimeUs}:${bTimeUs}`); }
  async resetAbLoop() {
    this.loopCalls.push('reset');
    if (this.failReset) throw new Error('reset failed');
  }
  async status(): Promise<IPlaybackStatus> {
    return { state: this.stateValue, sourceGeneration: 1, timestampUs: this.timestampUs, lengthUs: 4_000_000n };
  }
  async shutdown() { this.shutdownCount += 1; }
}

class ExactFake implements IExactFrameReader {
  shutdownCount = 0;
  async open() { return 4; }
  async exact(_frameIndex: number) { return exactFrame; }
  async identity() { return exactFrame.identity; }
  async thumbnail() { return exactFrame; }
  async atTime() { return exactFrame; }
  async scrub(_frameIndex: number) { return exactFrame; }
  async stepAdjacent() { return exactFrame; }
  async shutdown() { this.shutdownCount += 1; }
}

function frameAt(frameIndex: number): IHostExactFrame {
  return Object.freeze({ ...exactFrame, identity: Object.freeze({ ...exactFrame.identity, frameIndex }) });
}

async function preparedSession(exact: ExactFake, emit: (event: unknown) => void): Promise<ReviewSession> {
  const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
    previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback: new PlaybackFake(), exact,
    prepare: async () => prepared, emit });
  await session.open();
  await session.whenPrepared();
  return session;
}

describe('review session', () => {
  const previewPrepared: IExactReviewProxyHostResult = Object.freeze({
    ...prepared,
    proxyTimeline: Object.freeze({ cacheKey: prepared.cacheKey,
      pts: Object.freeze([0n, 1000n, 2000n, 3000n]),
      timebaseNumerator: 1n, timebaseDenominator: 1000n, durationPts: 4000n }),
  });

  it('jumps from the live playback clock, clamps to the end, and keeps playback running', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await session.play();
    playback.listener?.({
      kind: 'playback-frame', sourceGeneration: 1, frameGeneration: 1,
      playbackTimestampUs: 1_500_000n, width: 1, height: 1,
      sourceWidth: 1, sourceHeight: 1, pixels: new Uint8Array(4),
    });
    playback.timestampUs = 2_500_000n;

    expect(await session.jumpPlaybackBy(1_000_000n)).toBe(3_500_000n);
    expect(await session.jumpPlaybackBy(2_000_000n)).toBe(4_000_000n);
    expect(playback.stateValue).toBe('playing');
    expect(playback.loopCalls.slice(-2)).toEqual(['seek:3500000', 'seek:4000000']);
    await session.dispose();
  });

  it('plays the source and its prepared proxy muted when the movie was opened muted', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: true, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: vi.fn() });

    await session.open();
    await session.whenPrepared();

    expect(playback.openedSound).toEqual(['C:/movie.mp4:muted', 'C:/cache/proxy.mkv:muted']);
    await session.dispose();
  });

  it('keeps a muted movie muted when playback moves to an early proxy and when it recovers', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const playback = new PlaybackFake();
    let report: ((update: IReviewPreparationUpdate) => void) | undefined;
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: true, playback, exact: new ExactFake(),
      prepare: (_path, emit) => { report = emit; return preparation.promise; }, emit: () => undefined });
    await session.open();
    report?.({
      phase: 'proxy-ready', progressPercent: null,
      proxy: { cacheKey: 'a'.repeat(64), cacheHit: false, proxyPath: 'C:/early/proxy.mkv', normalizedSourcePath: null },
    });
    await vi.waitFor(() => expect(playback.openedPaths).toContain('C:/early/proxy.mkv'));
    preparation.resolve(previewPrepared);
    await session.whenPrepared();
    await session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 });
    playback.failReset = true;

    await expect(session.pauseExactPreview()).rejects.toThrow('reset failed');

    expect(playback.openedSound).toEqual(['C:/movie.mp4:muted', 'C:/early/proxy.mkv:muted', 'C:/cache/proxy.mkv:muted']);
    await session.dispose();
  });

  it('keeps the sound of a movie opened with sound', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: vi.fn() });

    await session.open();
    await session.whenPrepared();

    expect(playback.openedSound).toEqual(['C:/movie.mp4:sound', 'C:/cache/proxy.mkv:sound']);
    await session.dispose();
  });

  it('resolves exact time by the index and uses indexed boundary frames', async () => {
    const exact = new ExactFake();
    const atTime = vi.fn(async () => exactFrame);
    const scrub = vi.fn(async (index: number) => Object.freeze({ ...exactFrame,
      identity: Object.freeze({ ...exactFrame.identity, frameIndex: index }) }));
    exact.atTime = atTime;
    exact.scrub = scrub;
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback: new PlaybackFake(), exact,
      prepare: async () => prepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();

    expect((await session.scrubToTime(2_500_000n)).identity.frameIndex).toBe(2);
    expect(atTime).toHaveBeenCalledWith(2_500_000n);
    expect((await session.scrubToTime(0n)).identity.frameIndex).toBe(0);
    expect((await session.scrubToTime(4_000_000n)).identity.frameIndex).toBe(3);
    expect(scrub.mock.calls.map(call => call[0])).toEqual([0, 3]);
    await session.dispose();
  });

  it('accumulates paused jumps when the native status clock remains stale after a seek', async () => {
    const playback = new PlaybackFake();
    const status = playback.status.bind(playback);
    playback.status = async () => Object.freeze({ ...await status(), timestampUs: 0n, lengthUs: 0n });
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();

    expect(await session.jumpPlaybackBy(1_000_000n)).toBe(1_000_000n);
    expect(await session.jumpPlaybackBy(2_000_000n)).toBe(3_000_000n);
    expect(playback.loopCalls.slice(-2)).toEqual(['seek:1000000', 'seek:3000000']);
    await session.dispose();
  });

  it('arms the indexed A–B pair before seeking and hands Space to an exact in-range frame', async () => {
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    exact.scrub = async index => Object.freeze({ ...exactFrame,
      identity: Object.freeze({ ...exactFrame.identity, frameIndex: index }) });
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact,
      prepare: async () => previewPrepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 });
    expect(playback.loopCalls.slice(-2)).toEqual(['arm:999999:2500000', 'seek:1000000']);
    playback.timestampUs = 2_850_000n;
    const paused = await session.pauseExactPreview();
    expect(paused.identity.frameIndex).toBe(2);
    expect(playback.loopCalls.at(-1)).toBe('reset');
    await session.resumeExactPreview(2);
    expect(playback.loopCalls.slice(-2)).toEqual(['arm:999999:2500000', 'seek:2000000']);
    await session.dispose();
  });

  it('recovers a failed A–B reset by reopening the proxy at the Space ordinal', async () => {
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    exact.scrub = async index => Object.freeze({ ...exactFrame,
      identity: Object.freeze({ ...exactFrame.identity, frameIndex: index }) });
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact,
      prepare: async () => previewPrepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 });
    playback.timestampUs = 2_200_000n;
    playback.failReset = true;
    await expect(session.pauseExactPreview()).rejects.toThrow('reset failed');
    expect(playback.openedPaths.at(-1)).toBe(prepared.proxyPath);
    expect(playback.timestampUs).toBe(2_000_000n);
    expect(playback.stateValue).toBe('paused');
    await session.play();
    expect(playback.requestedPlayAtTimes.at(-1)).toBe(2_000_000n);
    await session.dispose();
  });

  it('keeps exact scrub available when reset and player reopening both fail', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => previewPrepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 });
    playback.failReset = true;
    playback.failRecovery = true;
    await expect(session.pauseExactPreview()).rejects.toThrow('reset failed');
    await expect(session.play()).rejects.toMatchObject({ category: 'invalid-state' });
    await expect(session.dragToFrame(2)).resolves.toMatchObject({ kind: 'exact-frame' });
    await session.dispose();
  });

  it('rejects a one-frame loop without changing the existing player state', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => previewPrepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await expect(session.startExactPreview({ startFrameIndex: 2, endFrameIndex: 2 }))
      .rejects.toMatchObject({ category: 'invalid-request' });
    expect(playback.loopCalls.some(call => call.startsWith('arm:'))).toBe(false);
    await session.dispose();
  });

  it('keeps exact review ready when a proxy has an unsupported loop clock', async () => {
    const unsupported = Object.freeze({ ...previewPrepared,
      proxyTimeline: Object.freeze({ ...previewPrepared.proxyTimeline!,
        pts: Object.freeze([1n, 1001n, 2001n, 3001n]), durationPts: 4001n }) });
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback: new PlaybackFake(), exact: new ExactFake(),
      prepare: async () => unsupported, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    expect(session.state()).toMatchObject({ phase: 'exact-ready', captureEnabled: true });
    await expect(session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 }))
      .rejects.toThrow('unsupported playback-clock origin');
    await expect(session.dragToFrame(2)).resolves.toMatchObject({ kind: 'exact-frame' });
    await session.dispose();
  });

  it('prevents an obsolete pending loop start from clearing a newer loop', async () => {
    const playback = new PlaybackFake();
    const firstArm = deferred<void>();
    const originalArm = playback.armAbLoop.bind(playback);
    let armCount = 0;
    playback.armAbLoop = async (a, b) => {
      armCount += 1;
      await originalArm(a, b);
      if (armCount === 1) await firstArm.promise;
    };
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => previewPrepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    const obsolete = session.startExactPreview({ startFrameIndex: 1, endFrameIndex: 2 });
    await vi.waitFor(() => expect(armCount).toBe(1));
    await session.stopExactPreview();
    const current = session.startExactPreview({ startFrameIndex: 0, endFrameIndex: 2 });
    firstArm.resolve();
    await Promise.all([obsolete, current]);
    expect(playback.loopCalls.at(-2)).toBe('arm:0:2500000');
    expect(playback.stateValue).toBe('playing');
    await session.stopExactPreview();
    await session.dispose();
  });
  it('renders a thumbnail without changing playback state or position', async () => {
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact,
      prepare: async () => prepared, emit: vi.fn(),
    });
    await session.open();
    await session.whenPrepared();
    await session.play();
    const position = playback.timestampUs;

    expect(await session.thumbnailFrame(2)).toBe(exactFrame);
    expect(playback.stateValue).toBe('playing');
    expect(playback.timestampUs).toBe(position);
    await session.dispose();
  });

  it('does not report an error when held stepping reaches a frame boundary', async () => {
    const exact = new ExactFake();
    const step = vi.fn(async () => { throw new BackendError('frame-boundary', 'Source boundary reached.', true); });
    exact.stepAdjacent = step;
    const emit = vi.fn();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback: new PlaybackFake(), exact,
      prepare: async () => prepared, emit });
    await session.open();
    await session.whenPrepared();

    await session.pressAdjacent(-1);
    await vi.waitFor(() => expect(step).toHaveBeenCalledOnce());
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    await session.dispose();
  });

  it('shows the frame a jump goes to without waiting out the progress-bar scrub delay', async () => {
    const exact = new ExactFake();
    exact.exact = async (frameIndex: number) => frameAt(frameIndex);
    const session = await preparedSession(exact, vi.fn());
    let shownFrame: number | null = null;

    void session.goToFrame(3).then(frame => { shownFrame = frame.identity.frameIndex; });
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(shownFrame).toBe(3);
    await session.dispose();
  });

  it('refuses a jump to a negative frame and keeps playback running', async () => {
    const playback = new PlaybackFake();
    const session = new ReviewSession({ id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: async () => prepared, emit: vi.fn() });
    await session.open();
    await session.whenPrepared();
    await session.play();

    await expect(session.goToFrame(-1)).rejects.toMatchObject({ category: 'invalid-request' });
    expect(playback.stateValue).toBe('playing');
    await session.dispose();
  });

  it('keeps the frame a jump goes to when a progress-bar scrub was still waiting', async () => {
    const exact = new ExactFake();
    exact.scrub = async (frameIndex: number) => frameAt(frameIndex);
    exact.exact = async (frameIndex: number) => frameAt(frameIndex);
    const session = await preparedSession(exact, vi.fn());

    const dragged = session.dragToFrame(1);
    await session.goToFrame(3);

    await expect(dragged).rejects.toMatchObject({ category: 'stale-response' });
    expect(await session.captureCurrentPoint()).toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 3 } });
    await session.dispose();
  });

  it('sends a requested frame to the window only as the answer to its request', async () => {
    const emit = vi.fn();
    const session = await preparedSession(new ExactFake(), emit);

    await session.goToFrame(2);
    await session.dragToFrame(2);
    await session.stepAdjacent(1);

    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'display-frame' }));
    await session.dispose();
  });

  it('sends a held step frame to the window as a display frame', async () => {
    const exact = new ExactFake();
    exact.stepAdjacent = async () => frameAt(3);
    const emit = vi.fn();
    const session = await preparedSession(exact, emit);

    await session.pressAdjacent(1);
    await session.releaseAdjacent(1);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'display-frame', frame: expect.objectContaining({ identity: expect.objectContaining({ frameIndex: 3 }) }),
    })));
    await session.dispose();
  });

  it('keeps playback capture inexact until preparation enables canonical scrub capture', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    const events: unknown[] = [];
    const session = new ReviewSession({
      id: 'session_12345678',
      sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false,
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
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact,
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
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
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

  it('applies Play after a proxy switch that began while playback was paused', async () => {
    const preparation = deferred<IExactReviewProxyHostResult>();
    const proxyOpened = deferred<void>();
    const proxyOpening = deferred<void>();
    const playback = new PlaybackFake();
    const originalOpen = playback.open.bind(playback);
    playback.open = async (source, options) => {
      if (source.includes('early')) {
        proxyOpening.resolve();
        await proxyOpened.promise;
        playback.stateValue = 'paused';
      }
      return originalOpen(source, options);
    };
    let report: ((update: IReviewPreparationUpdate) => void) | undefined;
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact: new ExactFake(),
      prepare: (_path, emit) => { report = emit; return preparation.promise; }, emit: () => undefined,
    });
    await session.open();
    report?.({ phase: 'proxy-ready', progressPercent: null,
      proxy: { cacheKey: 'a'.repeat(64), cacheHit: false, proxyPath: 'C:/early/proxy.mkv', normalizedSourcePath: null } });
    await proxyOpening.promise;
    const pausing = session.pause();
    const playing = session.play();
    proxyOpened.resolve();
    await Promise.all([pausing, playing]);
    expect(playback.stateValue).toBe('playing');
    preparation.resolve(prepared);
    await session.whenPrepared();
  });

  it('resumes playback from the last exact scrub frame instead of the prior playback timestamp', async () => {
    const playback = new PlaybackFake();
    const exact = new ExactFake();
    exact.scrub = async () => Object.freeze({ ...exactFrame, reviewTimeUs: 2_750_000n });
    const session = new ReviewSession({
      id: 'session_12345678', sourcePath: 'C:/movie.mp4',
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false, playback, exact,
      prepare: async () => prepared, emit: () => undefined,
    });
    await session.open();
    await session.whenPrepared();

    await session.dragToFrame(3);
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
