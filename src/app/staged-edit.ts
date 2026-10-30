import type { RefineRange, RefineRangeEndChange } from '../domain/refine-range.js';
import type { ZoomEditName } from '../domain/zoom-edit-composition.js';

// Refine's changes are its new ends; every other edit is discarded whole.
export type ZoomEditStagedChange = RefineRangeEndChange['endpoint'] | Exclude<ZoomEditName, 'refine'>;

export interface IStagedEdit {
  readonly name: ZoomEditName;
  readonly isStaged: boolean;
  stagedChanges(): readonly ZoomEditStagedChange[];
}

// The session keeps the range, since it replaces it as keys stage it and the movie window extends it.
export class StagedRefine implements IStagedEdit {
  readonly name = 'refine';

  constructor(private readonly stagedRange: () => RefineRange | null) {}

  get isStaged(): boolean {
    return this.stagedRange()?.isChanged ?? false;
  }

  stagedChanges(): readonly ZoomEditStagedChange[] {
    return Object.freeze(this.stagedRange()?.changedEnds().map(change => change.endpoint) ?? []);
  }
}

export class StagedLoopify implements IStagedEdit {
  readonly name = 'loopify';

  constructor(private staged: boolean) {}

  get isStaged(): boolean {
    return this.staged;
  }

  toggle(): void {
    this.staged = !this.staged;
  }

  stagedChanges(): readonly ZoomEditStagedChange[] {
    return Object.freeze(this.staged ? ['loopify'] : []);
  }
}
