import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type { ICreatedExtractionMedia } from '../frame-review/clip-extraction-api.js';
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
  readonly sourceGeneration: number;
  readonly collectionName: string;
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

export class ClipExtractionWorkflow {
  private readonly states = new Map<string, ClipExtractionEntryState>();
  private running = false;
  private cancelRequested = false;
  private currentRangeId: string | null = null;

  constructor(
    private readonly extractor: ExtractorPort,
    private readonly destination: DestinationPort,
    private readonly changed: () => void = () => undefined,
  ) {}

  state(rangeId: string): ClipExtractionEntryState {
    return this.states.get(rangeId) ?? Object.freeze({ kind: 'pending' });
  }

  async extractOne(request: IExtractOneRequest): Promise<void> {
    await this.run(request, [request.range]);
  }

  async extractAll(request: IExtractAllRequest): Promise<void> {
    const eligible = [...request.ranges].filter(range => range.kind === 'ready-to-extract');
    for (const range of eligible) this.setState(range.id, { kind: 'pending' });
    await this.run(request, eligible);
  }

  async retryPublication(rangeId: string): Promise<void> {
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
    this.cancelRequested = true;
    if (this.currentRangeId) this.setState(this.currentRangeId, { kind: 'cancelled' });
    await this.extractor.cancelCurrent?.();
  }

  private async run(context: IWorkflowContext, ranges: readonly IReadyToExtractRange[]): Promise<void> {
    if (this.running) throw new Error('An extraction batch is already running.');
    this.running = true;
    this.cancelRequested = false;
    try {
      const opened = await this.destination.open({ movieName: context.collectionName });
      for (const range of ranges) {
        if (this.cancelRequested) break;
        this.currentRangeId = range.id;
        this.setState(range.id, { kind: 'extracting' });
        let media: ICreatedExtractionMedia;
        try {
          media = await this.extractor.extract({
            range,
            sourceHandle: context.sourceHandle,
            currentSourceGeneration: context.sourceGeneration,
            destinationHandle: opened.destinationHandle,
            collectionName: context.collectionName,
          });
        } catch (error) {
          if (this.cancelRequested) this.setState(range.id, { kind: 'cancelled' });
          else this.setState(range.id, { kind: 'failed', message: this.message(error) });
          continue;
        }
        if (this.cancelRequested) {
          this.setState(range.id, { kind: 'cancelled' });
          break;
        }
        this.setState(range.id, { kind: 'publishing', media });
        try {
          await this.destination.publishCreatedMedia(media);
          this.setState(range.id, { kind: 'completed', media });
        } catch (error) {
          this.setState(range.id, { kind: 'publication-failed', media, message: this.message(error) });
        }
      }
    } finally {
      this.currentRangeId = null;
      this.running = false;
    }
  }

  private setState(rangeId: string, state: ClipExtractionEntryState): void {
    this.states.set(rangeId, Object.freeze(state));
    this.changed();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Extraction failed.';
  }
}
