import { ClipExtractor } from '../business-logic/clip-extractor.js';
import type { CapturedRangeId, IReadyToExtractRange } from '../domain/captured-range.js';
import type { IClipExtractionService } from '../business-logic/clip-extraction-service.js';
import type { ActivityInput } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import {
  ClipExtractionWorkflow,
  type ClipExtractionActivity,
  type ClipExtractionEntryState,
  type IExtractionBatchProgress,
} from './clip-extraction-workflow.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import { ExtractionPublisher, type ExtractionDestination } from './extraction-publisher.js';
import type { GifSessionStatus } from './gif-session-status.js';

// Awaited: extraction continues only after the open folder has reacted to the new clip.
export interface IExtractionPublicationListener {
  onFolderContentsPublished(folderPath: string): Promise<void> | void;
}

// The movie a range is extracted from.
export interface IExtractionMovie {
  readonly sourceHandle: string;
  readonly reviewSessionId?: string;
  readonly sourceGeneration: number;
  readonly movieName: string;
}

// What a capture queue needs to know about extraction to save itself and to allow removal.
export interface IExtractionProgressQuery {
  isCompleted(rangeId: CapturedRangeId): boolean;
  revisionBlock(rangeId: CapturedRangeId): string | null;
}

export interface IRangeExtractionEvents {
  extractionStateChanged: void;
}

type RangeExtractionDependencies = Readonly<{
  extractionService?: IClipExtractionService;
  destination?: ExtractionDestination;
  publications?: IExtractionPublicationListener;
  status: Pick<GifSessionStatus, 'show' | 'changed'>;
  reporter?: Pick<ActivityReporter, 'progress' | 'success' | 'failure'>;
  activityLog?: { log(entry: ActivityInput): unknown };
  diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

const PENDING: ClipExtractionEntryState = Object.freeze({ kind: 'pending' });

// Extracts ranges of the current movie into clips, and reports each run's outcome.
export class RangeExtraction implements IExtractionProgressQuery, IEventSource<IRangeExtractionEvents> {
  private readonly events = new EventSource<IRangeExtractionEvents>();
  private workflow: ClipExtractionWorkflow | null = null;
  private target: ExtractionDestination | undefined;
  private readonly reportedWarnings = new Set<string>();

  constructor(private readonly deps: RangeExtractionDependencies) {
    this.target = deps.destination;
  }

  get available(): boolean { return this.workflow !== null; }
  get batchProgress(): IExtractionBatchProgress | null { return this.workflow?.batchProgress ?? null; }
  get destination(): ExtractionDestination | undefined { return this.target; }

  on<TName extends keyof IRangeExtractionEvents>(name: TName, handler: EventHandler<IRangeExtractionEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  setDestination(destination: ExtractionDestination): void {
    if (this.workflow?.batchProgress) throw new Error('Wait for the current extraction to finish.');
    this.target = destination;
  }

  // Starts afresh for a newly opened movie; earlier extraction states belonged to the previous movie.
  startForMovie(movieName: string): void {
    const service = this.deps.extractionService;
    this.reportedWarnings.clear();
    this.workflow = service
      ? new ClipExtractionWorkflow(
        new ClipExtractor(service),
        new ExtractionPublisher(service, {
          destination: this.target,
          onPublished: publication => this.deps.publications?.onFolderContentsPublished(publication.folderPath),
          onPublishError: error => this.reportError('The clip was saved, but the Collection view could not refresh.', error),
        }),
        () => { this.events.emit('extractionStateChanged'); this.deps.status.changed(); },
        event => this.recordActivity(event, movieName),
      )
      : null;
  }

  state(rangeId: CapturedRangeId): ClipExtractionEntryState {
    return this.workflow?.state(rangeId) ?? PENDING;
  }

  isCompleted(rangeId: CapturedRangeId): boolean {
    return this.workflow?.state(rangeId).kind === 'completed';
  }

  revisionBlock(rangeId: CapturedRangeId): string | null {
    return this.workflow?.revisionBlock(rangeId) ?? null;
  }

  resetForRevision(rangeId: CapturedRangeId): void {
    this.workflow?.resetForRevision(rangeId);
  }

  // Whether a new extraction of this range may start: none is running and the range has no clip yet.
  canStart(rangeId: CapturedRangeId): boolean {
    if (!this.workflow || this.workflow.batchProgress) return false;
    const state = this.workflow.state(rangeId).kind;
    return state === 'pending' || state === 'failed' || state === 'cancelled';
  }

  // The outcome is judged over every queued range, so an earlier failure still asks for attention.
  async extractOne(movie: IExtractionMovie, range: IReadyToExtractRange, queuedRangeIds: () => readonly CapturedRangeId[]): Promise<void> {
    const workflow = this.workflow;
    if (!workflow) return;
    await this.run(() => workflow.extractOne({ ...movie, range }), queuedRangeIds);
  }

  async extractAll(movie: IExtractionMovie, ranges: readonly IReadyToExtractRange[], queuedRangeIds: () => readonly CapturedRangeId[]): Promise<void> {
    const workflow = this.workflow;
    if (!workflow || ranges.length === 0) return;
    await this.run(() => workflow.extractAll({ ...movie, ranges }), queuedRangeIds);
  }

  async retryPublication(rangeId: CapturedRangeId, queuedRangeIds: () => readonly CapturedRangeId[]): Promise<void> {
    const workflow = this.workflow;
    if (workflow?.state(rangeId).kind !== 'publication-failed') return;
    await this.run(() => workflow.retryPublication(rangeId), queuedRangeIds);
  }

  async cancel(): Promise<void> {
    await this.workflow?.cancel();
  }

  async dispose(): Promise<void> {
    await this.workflow?.cancel();
    this.workflow = null;
  }

  private async run(operation: () => Promise<void>, queuedRangeIds: () => readonly CapturedRangeId[]): Promise<void> {
    const { status } = this.deps;
    status.show('Extracting exact range');
    this.deps.reporter?.progress('Extracting exact range');
    status.changed();
    try {
      await operation();
      const rangeIds = queuedRangeIds();
      const failed = rangeIds.some(rangeId => {
        const kind = this.state(rangeId).kind;
        return kind === 'failed' || kind === 'publication-failed';
      });
      const cancelled = this.workflow?.wasCancelled === true;
      status.show(failed ? 'Some clips need attention' : cancelled ? 'Extraction cancelled' : 'Extraction complete');
      if (failed) this.reportError('Some clips could not be completed. Retry them from Clips.');
      else if (cancelled) this.deps.reporter?.progress('Extraction stopped. Completed clips were saved.');
      else this.deps.reporter?.success(`Exact clips were added to ${this.target?.kind === 'collection'
        ? this.target.collectionFilename : this.target?.folderPath ?? 'extraction-tmp'}.`);
      for (const rangeId of rangeIds) this.reportWarningOnce(rangeId);
      this.events.emit('extractionStateChanged');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Extraction could not start.';
      status.show(message);
      this.reportError(message, error);
    }
    status.changed();
  }

  private reportWarningOnce(rangeId: CapturedRangeId): void {
    const state = this.state(rangeId);
    if (state.kind !== 'completed' || !state.media.warning) return;
    const warningId = `${rangeId}\n${state.media.filename}`;
    if (this.reportedWarnings.has(warningId)) return;
    this.reportedWarnings.add(warningId);
    this.deps.reporter?.success(state.media.warning, 5000);
  }

  private recordActivity(event: ClipExtractionActivity, movieName: string): void {
    const sourceField = { label: 'Source movie', value: movieName };
    const log = this.deps.activityLog;
    if (event.kind === 'batch-started') {
      log?.log({ kind: 'information',
        message: `Extraction started for ${event.total} clip${event.total === 1 ? '' : 's'}.`,
        fields: [sourceField] });
    } else if (event.kind === 'clip-extracted') {
      log?.log({ kind: 'information',
        message: `Extracted ${event.filename} in ${event.durationMs} ms.`,
        fields: [{ label: 'Clip', value: event.filename },
          { label: 'Destination folder', value: event.folderPath }, sourceField] });
    } else {
      const outcome = event.cancelled ? 'cancelled' : 'finished';
      log?.log({ kind: 'information',
        message: `Extraction ${outcome}: ${event.extracted} of ${event.total} clip${event.total === 1 ? '' : 's'} extracted.`,
        fields: [sourceField] });
    }
  }

  private reportError(message: string, error?: unknown): void {
    this.deps.reporter?.failure(message);
    if (error !== undefined) void this.deps.diagnostics?.logRuntimeError(message, error);
  }
}
