import type { UnlockedEndpointChange } from './range-refinement-draft.js';

export interface IRefineScreenSession {
  readonly snapshot: Readonly<{ extractionBatch?: unknown }>;
  readonly refinementDraft: Readonly<{ unlockedChanges: readonly UnlockedEndpointChange[] }> | null;
}

export interface IScreenIdentity {
  readonly id: string;
}

export interface IProgressReporter {
  progress(message: string): void;
}

export type RefineScreen = Readonly<{ id: string; session: IRefineScreenSession | null }>;

export type RefineLeaveHold =
  | Readonly<{ kind: 'extraction-running' }>
  | Readonly<{ kind: 'unlocked-changes'; changes: readonly UnlockedEndpointChange[] }>;

type RefineScreenLeavePolicyOptions = Readonly<{
  refineScreens: readonly RefineScreen[];
  collectionRefineScreenId: string;
  reporter: IProgressReporter;
}>;

export class RefineScreenLeavePolicy {
  constructor(private readonly options: RefineScreenLeavePolicyOptions) {}

  canLeave(current: IScreenIdentity): boolean {
    const hold = this.holdOn(current);
    if (hold?.kind === 'extraction-running') {
      this.options.reporter.progress('Wait for the collection clip to finish saving, or cancel extraction before leaving Refine.');
    }
    return hold === null;
  }

  holdOn(screen: IScreenIdentity): RefineLeaveHold | null {
    // Collection Refine stays open until its clip is saved, so a later Collection save cannot overwrite the new membership.
    if (screen.id === this.options.collectionRefineScreenId && this.sessionOf(screen)?.snapshot.extractionBatch) {
      return Object.freeze({ kind: 'extraction-running' });
    }
    const changes = this.unlockedChangesOn(screen);
    return changes.length > 0 ? Object.freeze({ kind: 'unlocked-changes', changes }) : null;
  }

  unlockedChangesOn(screen: IScreenIdentity): readonly UnlockedEndpointChange[] {
    return this.sessionOf(screen)?.refinementDraft?.unlockedChanges ?? [];
  }

  private sessionOf(screen: IScreenIdentity): IRefineScreenSession | null {
    return this.options.refineScreens.find(refine => refine.id === screen.id)?.session ?? null;
  }
}
