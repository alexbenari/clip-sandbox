import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type { ICreatedExtractionMedia } from '../business-logic/clip-extraction-service.js';
import type { IClipExtractionProgress } from '../business-logic/clip-extraction-service.js';
import type { ClipExtractor } from '../business-logic/clip-extractor.js';
import type { ExtractionDestinationSession } from './extraction-destination-session.js';

export type ClipExtractionEntryState =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'extracting' }>
  | Readonly<{ kind: 'publishing'; media: ICreatedExtractionMedia }>
  | Readonly<{ kind: 'completed'; media: ICreatedExtractionMedia }>
  | Readonly<{ kind: 'failed'; message: string }>
  | Readonly<{ kind: 'publication-failed'; message: string; media: ICreatedExtractionMedia }>
  | Readonly<{ kind: 'cancelled' }>;

interface IWorkflowContext {
  readonly sourceHandle: string;
  readonly reviewSessionId?: string;
  readonly sourceGeneration: number;
  readonly movieName: string;
}

interface IExtractAllRequest extends IWorkflowContext {
  readonly ranges: readonly IReadyToExtractRange[];
}

interface IExtractOneRequest extends IWorkflowContext {
  readonly range: IReadyToExtractRange;
}

type ExtractorPort = Pick<ClipExtractor, 'extract'> & Partial<Pick<ClipExtractor, 'cancelCurrent'>>;
type DestinationPort = Pick<ExtractionDestinationSession,
  'open' | 'publishCreatedMedia' | 'retryPublication'>;

export interface IExtractionBatchProgress {
  readonly currentRangeId: string | null;
  readonly currentPosition: number;
  readonly total: number;
  readonly completed: number;
  readonly cancelling: boolean;
  readonly usingExactFallback: boolean;
  readonly progress: IClipExtractionProgress;
}

export type ClipExtractionActivity =
  | Readonly<{ kind: 'batch-started'; total: number }>
  | Readonly<{ kind: 'clip-extracted'; filename: string; folderPath: string; durationMs: number }>
  | Readonly<{ kind: 'batch-finished'; total: number; extracted: number; cancelled: boolean }>;

export class ClipExtractionWorkflow {
  private readonly states = new Map<string, ClipExtractionEntryState>();
  private running = false;
  private cancelRequested = false;
  private currentRangeId: string | null = null;
  private batch: IExtractionBatchProgress | null = null;

  constructor(
    private readonly extractor: ExtractorPort,
    private readonly destination: DestinationPort,
    private readonly changed: () => void = () => undefined,
    private readonly onActivity: (event: ClipExtractionActivity) => void = () => undefined,
  ) {}

  state(rangeId: string): ClipExtractionEntryState {
    return this.states.get(rangeId) ?? Object.freeze({ kind: 'pending' });
  }

  get batchProgress(): IExtractionBatchProgress | null { return this.batch; }
  get wasCancelled(): boolean { return this.cancelRequested; }

  revisionBlock(rangeId: string): string | null {
    if (this.running) return 'Wait for the current extraction batch to finish before locking changed frames.';
    const state = this.state(rangeId);
    if (state.kind === 'publication-failed') return 'Retry the failed collection save before changing this range.';
    if (state.kind === 'publishing' || state.kind === 'extracting') {
      return 'Wait for this extraction or collection save to finish before locking changed frames.';
    }
    return null;
  }

  resetForRevision(rangeId: string): void {
    const block = this.revisionBlock(rangeId);
    if (block) throw new Error(block);
    this.setState(rangeId, { kind: 'pending' });
  }

  async extractOne(request: IExtractOneRequest): Promise<void> {
    await this.run(request, [request.range], false);
  }

  async extractAll(request: IExtractAllRequest): Promise<void> {
    if (this.running) throw new Error('An extraction batch is already running.');
    const eligible = [...request.ranges].filter(range => range.kind === 'ready-to-extract');
    for (const range of eligible) this.setState(range.id, { kind: 'pending' });
    await this.run(request, eligible, true);
  }

  async retryPublication(rangeId: string): Promise<void> {
    if (this.running) throw new Error('Wait for the current extraction batch to finish.');
    this.cancelRequested = false;
    const state = this.states.get(rangeId);
    if (state?.kind !== 'publication-failed') throw new Error('This range has no publication to retry.');
    this.setState(rangeId, { kind: 'publishing', media: state.media });
    try {
      await this.destination.retryPublication(state.media.mediaHandle);
      this.setState(rangeId, { kind: 'completed', media: state.media });
    } catch (error) {
      this.setState(rangeId, {
        kind: 'publication-failed', media: state.media, message: this.message(error),
      });
    }
  }

  async cancel(): Promise<void> {
    if (!this.running) return;
    this.cancelRequested = true;
    if (this.batch) this.updateBatch({ ...this.batch, cancelling: true });
    if (this.currentRangeId && this.state(this.currentRangeId).kind === 'extracting') {
      try { await this.extractor.cancelCurrent?.(); }
      catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        console.warn('[clip-extraction] cancel-request-failed', { code: typeof code === 'string' ? code : 'unknown' });
      }
    }
  }

  private async run(context: IWorkflowContext, ranges: readonly IReadyToExtractRange[], isExtractAll: boolean): Promise<void> {
    if (this.running) throw new Error('An extraction batch is already running.');
    this.running = true;
    this.cancelRequested = false;
    let extracted = 0;
    try {
      this.updateBatch({ currentRangeId: null, currentPosition: 0, total: ranges.length,
        completed: 0, cancelling: false, usingExactFallback: false, progress: { stage: 'checking-source' } });
      if (isExtractAll) this.onActivity({ kind: 'batch-started', total: ranges.length });
      const opened = await this.destination.open({ movieName: context.movieName });
      for (const [index, range] of ranges.entries()) {
        if (this.cancelRequested) break;
        this.currentRangeId = range.id;
        this.updateBatch({ ...this.batch!, currentRangeId: range.id, currentPosition: index + 1,
          usingExactFallback: false, progress: { stage: 'checking-source' } });
        this.setState(range.id, { kind: 'extracting' });
        let media: ICreatedExtractionMedia;
        const startedAt = performance.now();
        let durationMs: number;
        try {
          media = await this.extractor.extract({
            range,
            sourceHandle: context.sourceHandle,
            reviewSessionId: context.reviewSessionId,
            currentSourceGeneration: context.sourceGeneration,
            destinationHandle: opened.destinationHandle,
            collectionName: opened.collection.collectionName,
          }, progress => {
            if (this.currentRangeId === range.id && this.batch && !this.cancelRequested) {
              this.updateBatch({ ...this.batch, progress,
                usingExactFallback: this.batch.usingExactFallback || progress.stage === 'exact-fallback' });
            }
          });
          durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        } catch (error) {
          if (this.cancelRequested) this.setState(range.id, { kind: 'cancelled' });
          else this.setState(range.id, { kind: 'failed', message: this.message(error) });
          continue;
        }
        this.setState(range.id, { kind: 'publishing', media });
        if (this.batch) this.updateBatch({ ...this.batch, progress: { stage: 'saving-media' } });
        try {
          await this.destination.publishCreatedMedia(media);
          this.setState(range.id, { kind: 'completed', media });
          if (this.batch) this.updateBatch({ ...this.batch, completed: this.batch.completed + 1 });
        } catch (error) {
          this.setState(range.id, { kind: 'publication-failed', media, message: this.message(error) });
          continue;
        }
        extracted += 1;
        this.onActivity({ kind: 'clip-extracted', filename: media.filename,
          folderPath: opened.folderPath, durationMs });
      }
    } finally {
      this.currentRangeId = null;
      this.running = false;
      this.updateBatch(null);
      if (isExtractAll) this.onActivity({ kind: 'batch-finished', total: ranges.length, extracted,
        cancelled: this.cancelRequested });
    }
  }

  private updateBatch(batch: IExtractionBatchProgress | null): void {
    this.batch = batch === null ? null : Object.freeze(batch);
    this.changed();
  }

  private setState(rangeId: string, state: ClipExtractionEntryState): void {
    this.states.set(rangeId, Object.freeze(state));
    this.changed();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Extraction failed.';
  }
}
