import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { AdjacentDirection } from '../adjacent-step-scheduler.js';
import { FrameReviewOpaqueId, type FrameReviewCapturePoint } from '../frame-review-api.js';
import { BackendError } from '../model/backend-error.js';
import { SourceFingerprint, type ISourceFingerprint } from '../model/source-fingerprint.js';
import { SourceFrameIdentity, type ISourceFrameIdentity } from '../model/source-frame-identity.js';
import { BestSourceFrameIndexer } from './bestsource-frame-indexer.js';
import { BestSourceFrameReader, type IHostExactFrame } from './bestsource-frame-reader.js';
import { FfmpegProxyCreator } from './ffmpeg-proxy-creator.js';
import { FrameIndexCache } from './frame-index-cache.js';
import { FrameMapValidator } from './frame-map-validator.js';
import { FrameReviewPaths } from './frame-review-paths.js';
import { LibVlcPlaybackEngine } from './libvlc-playback-engine.js';
import { NativeCommandProcess, NativeProcessClient } from './native-process-client.js';
import { ExactReviewProxyCache } from './exact-review-proxy-cache.js';
import { PlaybackProxyCache } from './playback-proxy-cache.js';
import { ProxyFrameTimelineCache } from './proxy-frame-timeline-cache.js';
import { ReviewPreparationService } from './review-preparation-service.js';
import type { IExactReviewProxyHostResult } from './review-preparation-service.js';
import { ReviewSession, type HostFrameReviewEvent, type IExactPreviewRange } from './review-session.js';
import { SourceInspector, type ISourceInspection } from './source-inspector.js';
import { SourceNormalizer } from './source-normalizer.js';

export interface IFrameReviewRuntimeConfiguration {
  readonly applicationFolder: string;
  readonly nativeBinaryFolder: string;
  readonly ffmpegExecutable: string;
  readonly ffprobeExecutable: string;
  readonly libVlcDll: string;
  readonly libVlcPluginFolder: string;
  readonly bestSourceVersion: string;
  readonly ffmpegVersion: string;
  readonly runtimePathEntries?: readonly string[];
}

export interface IFrameReviewHostSession {
  readonly id: string;
  state(): ReturnType<ReviewSession['state']>;
  captureContext(): Readonly<{ sourcePath: string; fingerprint: ISourceFingerprint }> | null;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekPlayback(timestampUs: bigint): Promise<void>;
  jumpPlaybackBy(deltaUs: bigint): Promise<bigint>;
  startExactPreview(range: IExactPreviewRange): Promise<void>;
  pauseExactPreview(): Promise<IHostExactFrame>;
  resumeExactPreview(frameIndex: number): Promise<void>;
  stopExactPreview(): Promise<IHostExactFrame | null>;
  enterFrameScrub(): Promise<IHostExactFrame>;
  scrubToFrame(frameIndex: number): Promise<IHostExactFrame>;
  scrubToTime(timestampUs: bigint): Promise<IHostExactFrame>;
  stepAdjacent(direction: AdjacentDirection): Promise<IHostExactFrame>;
  pressAdjacent(direction: AdjacentDirection): Promise<void>;
  releaseAdjacent(direction?: AdjacentDirection): Promise<void>;
  captureCurrentPoint(): Promise<FrameReviewCapturePoint>;
  frameIdentity(frameIndex: number): Promise<ISourceFrameIdentity>;
  thumbnailFrame(frameIndex: number): Promise<IHostExactFrame>;
  whenPrepared(): Promise<void>;
  dispose(): Promise<void>;
}

export interface IExactFrameReader {
  readonly frameCount: number;
  frameIdentity(frameIndex: number): Promise<ISourceFrameIdentity>;
}

export interface IFrameReviewHostOpenRequest {
  readonly sourceHandle: string;
  readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly muted: boolean;
  readonly emit: (event: HostFrameReviewEvent) => void;
}

export class FrameReviewHost {
  private static readonly exactReviewProxyCaches = new Map<string, ExactReviewProxyCache>();
  private static readonly playbackProxyCaches = new Map<string, PlaybackProxyCache>();
  private readonly sources = new Map<string, string>();
  private readonly sessions = new Map<string, ReviewSession>();
  private readonly inspections = new Map<string, Readonly<{ size: number; mtimeMs: number; inspection: Promise<ISourceInspection> }>>();
  private readonly paths: FrameReviewPaths;
  private readonly preparation: ReviewPreparationService;
  private readonly inspector: SourceInspector;
  private readonly indexer: BestSourceFrameIndexer;
  private readonly exactReviewProxyCache: ExactReviewProxyCache;
  private readonly playbackProxyCache: PlaybackProxyCache;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(private readonly configuration: IFrameReviewRuntimeConfiguration) {
    this.paths = new FrameReviewPaths(configuration.applicationFolder);
    const pathEntries = [
      ...(configuration.runtimePathEntries ?? []),
      path.dirname(configuration.libVlcDll),
      process.env.PATH ?? '',
    ].filter(Boolean);
    this.environment = Object.freeze({
      ...process.env,
      PATH: pathEntries.join(path.delimiter),
      VLC_PLUGIN_PATH: configuration.libVlcPluginFolder,
    });
    const commandProcess = new NativeCommandProcess(this.environment);
    const inspector = new SourceInspector({
      sampleSignatureExecutable: path.join(configuration.nativeBinaryFolder, 'media_sample_signature.exe'),
      packetScanExecutable: path.join(configuration.nativeBinaryFolder, 'media_packet_scan.exe'),
      ffprobeExecutable: configuration.ffprobeExecutable,
      bestSourceVersion: configuration.bestSourceVersion,
      ffmpegVersion: configuration.ffmpegVersion,
      environment: this.environment,
    });
    this.inspector = inspector;
    const indexer = new BestSourceFrameIndexer(
      path.join(configuration.nativeBinaryFolder, 'bestsource_gate.exe'), commandProcess);
    this.indexer = indexer;
    const exactReviewProxyCacheKey = `${this.paths.frameIndexCache}\n${this.paths.exactReviewProxyCache}`;
    let exactReviewProxyCache = FrameReviewHost.exactReviewProxyCaches.get(exactReviewProxyCacheKey);
    if (!exactReviewProxyCache) {
      exactReviewProxyCache = new ExactReviewProxyCache(this.paths);
      FrameReviewHost.exactReviewProxyCaches.set(exactReviewProxyCacheKey, exactReviewProxyCache);
    }
    let playbackProxyCache = FrameReviewHost.playbackProxyCaches.get(this.paths.playbackProxyCache);
    if (!playbackProxyCache) {
      playbackProxyCache = new PlaybackProxyCache(this.paths);
      FrameReviewHost.playbackProxyCaches.set(this.paths.playbackProxyCache, playbackProxyCache);
    }
    this.exactReviewProxyCache = exactReviewProxyCache;
    this.playbackProxyCache = playbackProxyCache;
    const frameIndexCache = new FrameIndexCache(indexer);
    this.preparation = new ReviewPreparationService({
      inspector,
      normalizer: new SourceNormalizer(configuration.ffmpegExecutable, commandProcess),
      frameIndexCache,
      proxyCreator: new FfmpegProxyCreator(configuration.ffmpegExecutable, commandProcess),
      frameMapValidator: new FrameMapValidator(),
      exactReviewProxyCache,
      playbackProxyCache,
      proxyFrameTimelineCache: new ProxyFrameTimelineCache(frameIndexCache),
    });
  }

  registerSource(sourcePath: string): string {
    if (!path.isAbsolute(sourcePath)) throw new Error('Frame-review source path must be absolute.');
    const handle = `source_${randomBytes(18).toString('base64url')}`;
    this.sources.set(handle, path.resolve(sourcePath));
    return handle;
  }

  async sourceMatchesFingerprint(sourcePath: string, expected: ISourceFingerprint): Promise<boolean> {
    const inspected = await this.inspectUnchanged(sourcePath);
    return SourceFingerprint.same(expected, SourceFingerprint.fromInspection(inspected.identity));
  }

  // Never builds an index: a movie that was not prepared, or whose index no longer matches, answers null.
  async cachedFrameTimesUs(sourcePath: string, frameIndexes: readonly number[]): Promise<readonly bigint[] | null> {
    if (frameIndexes.length === 0 || !frameIndexes.every(frameIndex => Number.isSafeInteger(frameIndex) && frameIndex >= 0)) {
      throw new BackendError('invalid-request', 'Frame ordinal is invalid.', true);
    }
    const inspection = await this.inspectUnchanged(sourcePath);
    const entry = await this.exactReviewProxyCache.find(inspection.identity);
    // A normalized movie's index numbers the normalized copy, whose times differ from the movie's.
    if (!entry || entry.normalizedSourcePath !== null || frameIndexes.some(frameIndex => frameIndex >= entry.frameCount)) return null;
    const frames = await this.indexer.frameTimesFromExistingIndex(inspection.sourcePath, entry.canonicalIndexPath, frameIndexes);
    return frames?.map(frame => SourceFrameIdentity.timeUs(frame)) ?? null;
  }

  async forgetPreparedReview(sourcePath: string): Promise<void> {
    const { identity } = await this.inspectUnchanged(sourcePath);
    await Promise.all([this.exactReviewProxyCache.remove(identity), this.playbackProxyCache.remove(this.exactReviewProxyCache.cacheKey(identity))]);
  }

  exactFrameReader(sessionId: string, sourceHandleValue: string): IExactFrameReader {
    const { session } = this.sessionShowing(sessionId, sourceHandleValue, 'Review session does not show this source.');
    const frameCount = session.state().preparedReview?.frameCount;
    if (session.state().phase !== 'exact-ready' || frameCount === undefined) {
      throw new BackendError('invalid-state', 'Exact frames are not ready.', true);
    }
    return Object.freeze({ frameCount, frameIdentity: (frameIndex: number) => session.frameIdentity(frameIndex) });
  }

  async findFrameByCheckValue(
    sessionId: string,
    sourceHandle: string,
    frameInfoHash: string,
    searchOrder: Iterable<number>,
  ): Promise<number | null> {
    if (!/^[a-f0-9]{16}$/.test(frameInfoHash)) throw new BackendError('invalid-request', 'Frame check value is invalid.', true);
    const reader = this.exactFrameReader(sessionId, sourceHandle);
    for (const frameIndex of searchOrder) {
      if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= reader.frameCount) continue;
      if ((await reader.frameIdentity(frameIndex)).frameInfoHash === frameInfoHash) return frameIndex;
    }
    return null;
  }

  async prepareExtractionSource(sourceHandleValue: string, signal?: AbortSignal): Promise<IExactReviewProxyHostResult> {
    const sourceHandle = FrameReviewOpaqueId.sourceHandle(sourceHandleValue);
    const sourcePath = this.sources.get(sourceHandle);
    if (!sourcePath) throw new BackendError('invalid-request', 'Frame-review source handle is unknown.', true);
    return this.preparation.prepareForExtraction(sourcePath, signal);
  }

  async open(request: IFrameReviewHostOpenRequest): Promise<IFrameReviewHostSession> {
    const sourceHandle = FrameReviewOpaqueId.sourceHandle(request.sourceHandle);
    const sourcePath = this.sources.get(sourceHandle);
    if (!sourcePath) throw new BackendError('invalid-request', 'Frame-review source handle is unknown.', true);
    this.assertPreviewBounds(request.previewBounds);
    const id = `session_${randomBytes(18).toString('base64url')}`;
    const playback = new LibVlcPlaybackEngine(new NativeProcessClient({
      executable: path.join(this.configuration.nativeBinaryFolder, 'libvlc_media_service.exe'),
      args: [this.configuration.libVlcDll],
      env: this.environment,
    }));
    const exact = new BestSourceFrameReader(new NativeProcessClient({
      executable: path.join(this.configuration.nativeBinaryFolder, 'bestsource_media_service.exe'),
      env: this.environment,
    }));
    const session = new ReviewSession({
      id,
      sourcePath,
      previewBounds: request.previewBounds,
      muted: request.muted,
      playback,
      exact,
      prepare: (source, emit, signal) => this.preparation.prepare(source, emit, signal),
      emit: request.emit,
    });
    this.sessions.set(id, session);
    try {
      await session.open();
      return session;
    } catch (error) {
      this.sessions.delete(id);
      await session.dispose();
      throw error;
    }
  }

  session(id: string): IFrameReviewHostSession {
    const sessionId = FrameReviewOpaqueId.sessionId(id);
    const session = this.sessions.get(sessionId);
    if (!session) throw new BackendError('invalid-request', 'Frame-review session is unknown.', true);
    return session;
  }

  captureContext(sessionId: string): Readonly<{ sourcePath: string; fingerprint: ISourceFingerprint }> {
    const context = this.session(sessionId).captureContext();
    if (!context) throw new BackendError('invalid-state', 'Movie identity is not ready.', true);
    return context;
  }

  async extractionFrameIdentities(
    sessionId: string,
    sourceHandleValue: string,
    startFrameIndex: number,
    endFrameIndex: number,
    preparedIdentity: Omit<ISourceFingerprint, 'fingerprintVersion'>,
  ): Promise<readonly [ISourceFrameIdentity, ISourceFrameIdentity]> {
    const refusal = 'Review session does not match the extraction source.';
    const { session, context } = this.sessionShowing(sessionId, sourceHandleValue, refusal);
    if (!SourceFingerprint.same(context.fingerprint, SourceFingerprint.fromInspection(preparedIdentity))) {
      throw new BackendError('invalid-request', refusal, true);
    }
    return Promise.all([session.frameIdentity(startFrameIndex), session.frameIdentity(endFrameIndex)]);
  }

  async extractionFrameTimeline(
    sessionId: string,
    sourceHandleValue: string,
    startFrameIndex: number,
    endFrameIndex: number,
    preparedIdentity: Omit<ISourceFingerprint, 'fingerprintVersion'>,
  ): Promise<readonly ISourceFrameIdentity[]> {
    if (!Number.isSafeInteger(startFrameIndex) || !Number.isSafeInteger(endFrameIndex)
      || startFrameIndex < 0 || endFrameIndex < startFrameIndex || endFrameIndex - startFrameIndex > 5_000) {
      throw new BackendError('invalid-request', 'Extraction frame window is unavailable.', true);
    }
    const refusal = 'Review session does not match the extraction source.';
    const { session, context } = this.sessionShowing(sessionId, sourceHandleValue, refusal);
    if (!SourceFingerprint.same(context.fingerprint, SourceFingerprint.fromInspection(preparedIdentity))) {
      throw new BackendError('invalid-request', refusal, true);
    }
    const identities: ISourceFrameIdentity[] = [];
    for (let ordinal = startFrameIndex; ordinal <= endFrameIndex; ordinal += 1) {
      identities.push(await session.frameIdentity(ordinal));
    }
    return Object.freeze(identities);
  }

  async closeSession(id: string): Promise<void> {
    const sessionId = FrameReviewOpaqueId.sessionId(id);
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.dispose();
  }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.sources.clear();
    await Promise.allSettled(sessions.map((session) => session.dispose()));
  }

  // Inspecting a feature film takes seconds, so an unchanged file is inspected once per host.
  private async inspectUnchanged(sourcePath: string): Promise<ISourceInspection> {
    const resolved = path.resolve(sourcePath);
    const { size, mtimeMs } = await stat(resolved);
    const known = this.inspections.get(resolved);
    if (known && known.size === size && known.mtimeMs === mtimeMs) return known.inspection;
    const inspection = this.inspector.inspect(resolved);
    this.inspections.delete(resolved);
    this.inspections.set(resolved, { size, mtimeMs, inspection });
    if (this.inspections.size > 8) this.inspections.delete(this.inspections.keys().next().value!);
    inspection.catch(() => { if (this.inspections.get(resolved)?.inspection === inspection) this.inspections.delete(resolved); });
    return inspection;
  }

  private sessionShowing(sessionId: string, sourceHandleValue: string, refusal: string)
    : Readonly<{ session: IFrameReviewHostSession; context: Readonly<{ sourcePath: string; fingerprint: ISourceFingerprint }> }> {
    const sourcePath = this.sources.get(FrameReviewOpaqueId.sourceHandle(sourceHandleValue));
    const session = this.session(sessionId);
    const context = session.captureContext();
    if (!sourcePath || !context || context.sourcePath !== sourcePath) throw new BackendError('invalid-request', refusal, true);
    return Object.freeze({ session, context });
  }

  private assertPreviewBounds(bounds: Readonly<{ maxWidth: number; maxHeight: number }>): void {
    if (!bounds || !Number.isSafeInteger(bounds.maxWidth) || bounds.maxWidth < 1 || bounds.maxWidth > 16_384
      || !Number.isSafeInteger(bounds.maxHeight) || bounds.maxHeight < 1 || bounds.maxHeight > 16_384
      || bounds.maxWidth * bounds.maxHeight * 4 > 256 * 1024 * 1024) {
      throw new BackendError('invalid-request', 'Frame-review preview bounds are invalid.', true);
    }
  }
}
