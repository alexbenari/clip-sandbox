export interface IExtractionBatchSource {
  readonly snapshot: Readonly<{ extractionBatch?: unknown }>;
}

export interface IScreenIdentity {
  readonly id: string;
}

export class RefineScreenLeavePolicy {
  constructor(
    private readonly refineScreenId: string,
    private readonly refinementSession: IExtractionBatchSource | null,
    private readonly reportBlocked: (message: string) => void,
  ) {}

  canLeave(current: IScreenIdentity): boolean {
    if (current.id !== this.refineScreenId || !this.refinementSession?.snapshot.extractionBatch) return true;
    this.reportBlocked('Wait for the collection clip to finish saving, or cancel extraction before leaving Refine.');
    return false;
  }
}
