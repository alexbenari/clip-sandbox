import type { UnlockedEndpointChange } from './range-refinement-draft.js';

export interface IRefineScreenSession {
  readonly refinementDraft: Readonly<{ unlockedChanges: readonly UnlockedEndpointChange[] }> | null;
}

export interface IScreenIdentity {
  readonly id: string;
}

export type RefineScreen = Readonly<{ id: string; session: IRefineScreenSession | null }>;

type RefineScreenLeavePolicyOptions = Readonly<{
  refineScreen: RefineScreen;
}>;

export class RefineScreenLeavePolicy {
  constructor(private readonly options: RefineScreenLeavePolicyOptions) {}

  canLeave(current: IScreenIdentity): boolean {
    return this.unlockedChangesOn(current).length === 0;
  }

  unlockedChangesOn(screen: IScreenIdentity): readonly UnlockedEndpointChange[] {
    return this.sessionOf(screen)?.refinementDraft?.unlockedChanges ?? [];
  }

  private sessionOf(screen: IScreenIdentity): IRefineScreenSession | null {
    const { refineScreen } = this.options;
    return refineScreen.id === screen.id ? refineScreen.session : null;
  }
}
