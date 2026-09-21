import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { AdjacentDirection } from '../adjacent-step-scheduler.js';
import { FrameReviewOpaqueId, type FrameReviewCapturePoint } from '../frame-review-api.js';
import { BackendError } from '../model/backend-error.js';
import { BestSourceFrameIndexer } from './bestsource-frame-indexer.js';
import { BestSourceFrameReader, type IHostExactFrame } from './bestsource-frame-reader.js';
import { FfmpegProxyCreator } from './ffmpeg-proxy-creator.js';
import { FrameIndexCache } from './frame-index-cache.js';
import { FrameMapValidator } from './frame-map-validator.js';
import { FrameReviewPaths } from './frame-review-paths.js';
import { LibVlcPlaybackEngine } from './libvlc-playback-engine.js';
import { NativeCommandProcess, NativeProcessClient } from './native-process-client.js';
import { PreparedReviewCache } from './prepared-review-cache.js';
import { ReviewPreparationService } from './review-preparation-service.js';
import type { IPreparedReviewHostResult } from './review-preparation-service.js';
import { ReviewSession, type HostFrameReviewEvent } from './review-session.js';
import { SourceInspector } from './source-inspector.js';
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
  play(): Promise<void>;
  pause(): Promise<void>;
  setRate(rate: number): Promise<void>;
  seekPlayback(timestampUs: bigint): Promise<void>;
  enterFrameScrub(): Promise<IHostExactFrame>;
  scrubToFrame(frameIndex: number): Promise<IHostExactFrame>;
  stepAdjacent(direction: AdjacentDirection): Promise<IHostExactFrame>;
  pressAdjacent(direction: AdjacentDirection): Promise<void>;
  releaseAdjacent(direction?: AdjacentDirection): Promise<void>;
  captureCurrentPoint(): Promise<FrameReviewCapturePoint>;
  whenPrepared(): Promise<void>;
  dispose(): Promise<void>;
}

export interface IFrameReviewHostOpenRequest {
  readonly sourceHandle: string;
  readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly emit: (event: HostFrameReviewEvent) => void;
}

export class FrameReviewHost {
  private static readonly preparedCaches = new Map<string, PreparedReviewCache>();
  private readonly sources = new Map<string, string>();
  private readonly sessions = new Map<string, ReviewSession>();
  private readonly paths: FrameReviewPaths;
  private readonly preparation: ReviewPreparationService;
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
    const indexer = new BestSourceFrameIndexer(
      path.join(configuration.nativeBinaryFolder, 'bestsource_gate.exe'), commandProcess);
    const preparedReviewCacheKey = `${this.paths.frameIndexCache}\n${this.paths.proxyCache}`;
    let preparedReviewCache = FrameReviewHost.preparedCaches.get(preparedReviewCacheKey);
    if (!preparedReviewCache) {
      preparedReviewCache = new PreparedReviewCache(this.paths);
      FrameReviewHost.preparedCaches.set(preparedReviewCacheKey, preparedReviewCache);
    }
    this.preparation = new ReviewPreparationService({
      inspector,
      normalizer: new SourceNormalizer(configuration.ffmpegExecutable, commandProcess),
      frameIndexCache: new FrameIndexCache(indexer),
      proxyCreator: new FfmpegProxyCreator(configuration.ffmpegExecutable, commandProcess),
      frameMapValidator: new FrameMapValidator(),
      preparedReviewCache,
    });
  }

  registerSource(sourcePath: string): string {
    if (!path.isAbsolute(sourcePath)) throw new Error('Frame-review source path must be absolute.');
    const handle = `source_${randomBytes(18).toString('base64url')}`;
    this.sources.set(handle, path.resolve(sourcePath));
    return handle;
  }

  async prepareExtractionSource(sourceHandleValue: string, signal?: AbortSignal): Promise<IPreparedReviewHostResult> {
    const sourceHandle = FrameReviewOpaqueId.sourceHandle(sourceHandleValue);
    const sourcePath = this.sources.get(sourceHandle);
    if (!sourcePath) throw new BackendError('invalid-request', 'Frame-review source handle is unknown.', true);
    return this.preparation.prepare(sourcePath, () => undefined, signal);
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

  private assertPreviewBounds(bounds: Readonly<{ maxWidth: number; maxHeight: number }>): void {
    if (!bounds || !Number.isSafeInteger(bounds.maxWidth) || bounds.maxWidth < 1 || bounds.maxWidth > 16_384
      || !Number.isSafeInteger(bounds.maxHeight) || bounds.maxHeight < 1 || bounds.maxHeight > 16_384
      || bounds.maxWidth * bounds.maxHeight * 4 > 256 * 1024 * 1024) {
      throw new BackendError('invalid-request', 'Frame-review preview bounds are invalid.', true);
    }
  }
}
