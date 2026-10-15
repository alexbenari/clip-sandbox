export interface IExtractionBatchSource {
  readonly snapshot: Readonly<{ extractionBatch?: unknown }>;
}

export interface IScreenIdentity {
  readonly id: string;
}

export interface IProgressReporter {
  progress(message: string): void;
}

export class RefineScreenLeavePolicy {
  constructor(
    private readonly refineScreenId: string,
    private readonly refinementSession: IExtractionBatchSource | null,
    private readonly reporter: IProgressReporter,
  ) {}

  canLeave(current: IScreenIdentity): boolean {
    if (current.id !== this.refineScreenId || !this.refinementSession?.snapshot.extractionBatch) return true;
    this.reporter.progress('Wait for the collection clip to finish saving, or cancel extraction before leaving Refine.');
    return false;
  }
}
