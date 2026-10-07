import type { IExactReviewProxyEntry, IExactReviewProxyIdentity, ExactReviewProxyCache } from './exact-review-proxy-cache.js';
import type { SourceInspector } from './source-inspector.js';
import type { SourceNormalizer } from './source-normalizer.js';
import type { FrameIndexCache } from './frame-index-cache.js';
import type { FfmpegProxyCreator } from './ffmpeg-proxy-creator.js';
import type { FrameMapValidator } from './frame-map-validator.js';
import type { IPlaybackProxyEntry, PlaybackProxyCache } from './playback-proxy-cache.js';
import type { IProxyFrameTimeline, ProxyFrameTimelineCache } from './proxy-frame-timeline-cache.js';
import { link } from 'node:fs/promises';

export type PreparationPhase = 'inspecting' | 'cache-validation' | 'normalizing' | 'indexing'
  | 'proxy-encoding' | 'proxy-ready' | 'proxy-indexing' | 'validating';

export interface IReviewPreparationUpdate {
  readonly phase: PreparationPhase;
  readonly progressPercent: number | null;
  readonly proxy: IPlaybackProxyEntry | null;
}

export interface IExactReviewProxyHostResult extends IExactReviewProxyEntry {
  readonly canonicalSourcePath: string;
  readonly sourcePath: string;
  readonly selectedStream: number;
  readonly identity: IExactReviewProxyIdentity;
  readonly proxyTimeline: IProxyFrameTimeline | null;
  readonly proxyTimelineError: string | null;
}

export interface IReviewPreparationDependencies {
  readonly inspector: SourceInspector;
  readonly normalizer: SourceNormalizer;
  readonly frameIndexCache: FrameIndexCache;
  readonly proxyCreator: FfmpegProxyCreator;
  readonly frameMapValidator: FrameMapValidator;
  readonly exactReviewProxyCache: ExactReviewProxyCache;
  readonly playbackProxyCache: PlaybackProxyCache;
  readonly proxyFrameTimelineCache: ProxyFrameTimelineCache;
}

export class ReviewPreparationService {
  constructor(private readonly dependencies: IReviewPreparationDependencies) {}

  async prepare(
    sourcePath: string,
    emit: (update: IReviewPreparationUpdate) => void,
    signal?: AbortSignal,
  ): Promise<IExactReviewProxyHostResult> {
    return this.prepareInternal(sourcePath, emit, signal, true);
  }

  async prepareForExtraction(sourcePath: string, signal?: AbortSignal): Promise<IExactReviewProxyHostResult> {
    return this.prepareInternal(sourcePath, () => undefined, signal, false);
  }

  private async prepareInternal(
    sourcePath: string,
    emit: (update: IReviewPreparationUpdate) => void,
    signal: AbortSignal | undefined,
    includeTimeline: boolean,
  ): Promise<IExactReviewProxyHostResult> {
    const report = (phase: PreparationPhase, progressPercent: number | null = null, proxy: IPlaybackProxyEntry | null = null): void => {
      emit(Object.freeze({ phase, progressPercent, proxy }));
    };
    report('inspecting');
    const inspection = await this.dependencies.inspector.inspect(sourcePath, signal);
    report('cache-validation');
    const cached = await this.dependencies.exactReviewProxyCache.find(inspection.identity);
    if (cached) return this.resultWithTimeline(cached, inspection, signal, includeTimeline);
    const cacheKey = this.dependencies.exactReviewProxyCache.cacheKey(inspection.identity);
    report(inspection.requiresTimestampNormalization ? 'normalizing' : 'proxy-encoding');
    const proxy = await this.dependencies.playbackProxyCache.getOrCreate(
      inspection.identity,
      cacheKey,
      async (workspace, writerSignal) => {
        const normalized = await this.dependencies.normalizer.normalizeIfNeeded(
          inspection, workspace.normalizedSourceFile, writerSignal);
        report('proxy-encoding');
        await this.dependencies.proxyCreator.create(normalized.sourcePath, workspace.proxyFile, writerSignal);
        return Object.freeze({ workspace, normalizedSource: normalized.normalized });
      },
      signal,
    );
    report('proxy-ready', null, proxy);
    const entry = await this.dependencies.exactReviewProxyCache.getOrCreate(inspection.identity, async (
      workspace,
      writerSignal,
    ) => {
      const canonicalSourcePath = proxy.normalizedSourcePath ?? inspection.sourcePath;
      if (proxy.normalizedSourcePath) await link(proxy.normalizedSourcePath, workspace.normalizedSourceFile);
      report('indexing');
      const canonicalIndex = await this.dependencies.frameIndexCache.build(
        canonicalSourcePath, workspace.canonicalIndexFile, writerSignal, progress => report('indexing', progress));
      await link(proxy.proxyPath, workspace.proxyFile);
      report('proxy-indexing');
      const proxyIndex = await this.dependencies.frameIndexCache.build(
        workspace.proxyFile, workspace.proxyIndexFile, writerSignal, progress => report('proxy-indexing', progress));
      report('validating');
      await this.dependencies.frameMapValidator.validateAndWrite(
        canonicalIndex.frameCount, proxyIndex.frameCount, workspace.frameMapFile);
      return Object.freeze({
        workspace,
        frameCount: canonicalIndex.frameCount,
        sourceWidth: inspection.sourceWidth,
        sourceHeight: inspection.sourceHeight,
        durationUs: inspection.durationUs,
        normalizedSource: proxy.normalizedSourcePath !== null,
      });
    }, signal);
    return this.resultWithTimeline(entry, inspection, signal, includeTimeline);
  }

  private async resultWithTimeline(
    entry: IExactReviewProxyEntry,
    inspection: Awaited<ReturnType<SourceInspector['inspect']>>,
    signal: AbortSignal | undefined,
    includeTimeline: boolean,
  ): Promise<IExactReviewProxyHostResult> {
    let proxyTimeline: IProxyFrameTimeline | null = null;
    let proxyTimelineError: string | null = null;
    if (includeTimeline) {
      try {
        proxyTimeline = await this.dependencies.proxyFrameTimelineCache.ensure(entry, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        proxyTimelineError = error instanceof Error ? error.message : String(error);
      }
    }
    return Object.freeze({
      ...entry,
      canonicalSourcePath: entry.normalizedSourcePath ?? inspection.sourcePath,
      sourcePath: inspection.sourcePath,
      selectedStream: inspection.selectedStream,
      identity: inspection.identity,
      proxyTimeline,
      proxyTimelineError,
    });
  }
}
