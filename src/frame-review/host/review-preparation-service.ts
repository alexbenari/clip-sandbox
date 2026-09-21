import type { IExactReviewProxyEntry, IExactReviewProxyIdentity, ExactReviewProxyCache } from './exact-review-proxy-cache.js';
import type { SourceInspector } from './source-inspector.js';
import type { SourceNormalizer } from './source-normalizer.js';
import type { FrameIndexCache } from './frame-index-cache.js';
import type { FfmpegProxyCreator } from './ffmpeg-proxy-creator.js';
import type { FrameMapValidator } from './frame-map-validator.js';
import type { IPlaybackProxyEntry, PlaybackProxyCache } from './playback-proxy-cache.js';
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
}

export interface IReviewPreparationDependencies {
  readonly inspector: SourceInspector;
  readonly normalizer: SourceNormalizer;
  readonly frameIndexCache: FrameIndexCache;
  readonly proxyCreator: FfmpegProxyCreator;
  readonly frameMapValidator: FrameMapValidator;
  readonly exactReviewProxyCache: ExactReviewProxyCache;
  readonly playbackProxyCache: PlaybackProxyCache;
}

export class ReviewPreparationService {
  constructor(private readonly dependencies: IReviewPreparationDependencies) {}

  async prepare(
    sourcePath: string,
    emit: (update: IReviewPreparationUpdate) => void,
    signal?: AbortSignal,
  ): Promise<IExactReviewProxyHostResult> {
    const report = (phase: PreparationPhase, progressPercent: number | null = null, proxy: IPlaybackProxyEntry | null = null): void => {
      emit(Object.freeze({ phase, progressPercent, proxy }));
    };
    report('inspecting');
    const inspection = await this.dependencies.inspector.inspect(sourcePath, signal);
    report('cache-validation');
    const cached = await this.dependencies.exactReviewProxyCache.find(inspection.identity);
    if (cached) return this.result(cached, inspection);
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
    return this.result(entry, inspection);
  }

  private result(entry: IExactReviewProxyEntry, inspection: Awaited<ReturnType<SourceInspector['inspect']>>): IExactReviewProxyHostResult {
    return Object.freeze({
      ...entry,
      canonicalSourcePath: entry.normalizedSourcePath ?? inspection.sourcePath,
      sourcePath: inspection.sourcePath,
      selectedStream: inspection.selectedStream,
      identity: inspection.identity,
    });
  }
}
