import type { IPreparedReviewEntry, IPreparedReviewIdentity, PreparedReviewCache } from './prepared-review-cache.js';
import type { SourceInspector } from './source-inspector.js';
import type { SourceNormalizer } from './source-normalizer.js';
import type { FrameIndexCache } from './frame-index-cache.js';
import type { FfmpegProxyCreator } from './ffmpeg-proxy-creator.js';
import type { FrameMapValidator } from './frame-map-validator.js';

export type PreparationPhase = 'inspecting' | 'cache-validation' | 'normalizing' | 'indexing'
  | 'proxy-encoding' | 'proxy-indexing' | 'validating';

export interface IPreparedReviewHostResult extends IPreparedReviewEntry {
  readonly canonicalSourcePath: string;
  readonly sourcePath: string;
  readonly selectedStream: number;
  readonly identity: IPreparedReviewIdentity;
}

export interface IReviewPreparationDependencies {
  readonly inspector: SourceInspector;
  readonly normalizer: SourceNormalizer;
  readonly frameIndexCache: FrameIndexCache;
  readonly proxyCreator: FfmpegProxyCreator;
  readonly frameMapValidator: FrameMapValidator;
  readonly preparedReviewCache: PreparedReviewCache;
}

export class ReviewPreparationService {
  constructor(private readonly dependencies: IReviewPreparationDependencies) {}

  async prepare(
    sourcePath: string,
    emit: (phase: PreparationPhase) => void,
    signal?: AbortSignal,
  ): Promise<IPreparedReviewHostResult> {
    emit('inspecting');
    const inspection = await this.dependencies.inspector.inspect(sourcePath, signal);
    emit('cache-validation');
    const entry = await this.dependencies.preparedReviewCache.getOrCreate(inspection.identity, async (
      workspace,
      writerSignal,
    ) => {
      emit('normalizing');
      const normalized = await this.dependencies.normalizer.normalizeIfNeeded(
        inspection, workspace.normalizedSourceFile, writerSignal);
      emit('indexing');
      const canonicalIndex = await this.dependencies.frameIndexCache.build(
        normalized.sourcePath, workspace.canonicalIndexFile, writerSignal);
      emit('proxy-encoding');
      await this.dependencies.proxyCreator.create(normalized.sourcePath, workspace.proxyFile, writerSignal);
      emit('proxy-indexing');
      const proxyIndex = await this.dependencies.frameIndexCache.build(
        workspace.proxyFile, workspace.proxyIndexFile, writerSignal);
      emit('validating');
      await this.dependencies.frameMapValidator.validateAndWrite(
        canonicalIndex.frameCount, proxyIndex.frameCount, workspace.frameMapFile);
      return Object.freeze({
        workspace,
        frameCount: canonicalIndex.frameCount,
        sourceWidth: inspection.sourceWidth,
        sourceHeight: inspection.sourceHeight,
        durationUs: inspection.durationUs,
        normalizedSource: normalized.normalized,
      });
    }, signal);
    return Object.freeze({
      ...entry,
      canonicalSourcePath: entry.normalizedSourcePath ?? inspection.sourcePath,
      sourcePath: inspection.sourcePath,
      selectedStream: inspection.selectedStream,
      identity: inspection.identity,
    });
  }
}
