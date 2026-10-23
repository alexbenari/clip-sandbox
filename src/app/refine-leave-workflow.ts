import type { IScreenNavigation } from './collection-refinement-workflow.js';
import type { IEventSource } from './event-source.js';
import type { UnlockedEndpointChange } from './range-refinement-draft.js';
import type { IScreenIdentity, RefineScreenLeavePolicy } from './refine-screen-leave-policy.js';

export interface IDiscardRefinementPrompt extends IEventSource<{ confirmed: void; cancelled: void }> {
  open(changes: readonly UnlockedEndpointChange[]): void;
  close(): void;
}

export interface IScreenChangeRequest {
  readonly from: IScreenIdentity;
  readonly to: IScreenIdentity;
}

export interface IScreenChanges extends IEventSource<{
  screenChangeRefused: IScreenChangeRequest;
  screenChanged: IScreenIdentity;
}> {}

type RefineLeaveDependencies = Readonly<{
  policy: Pick<RefineScreenLeavePolicy, 'holdOn' | 'unlockedChangesOn'>;
  prompt: IDiscardRefinementPrompt;
  refineScreens: readonly Readonly<{ id: string; session: Readonly<{ abandonRefinement(): unknown }> | null }>[];
  navigation: Pick<IScreenNavigation, 'activate' | 'activeScreen'>;
  screenChanges: IScreenChanges;
}>;

// Leaving Refine with staged endpoints that are not locked asks first, then discards them.
export class RefineLeaveWorkflow {
  private pending: Readonly<{ screenId: string; settle: (discard: boolean) => void }> | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: RefineLeaveDependencies) {
    this.unsubscribes = [
      deps.prompt.on('confirmed', () => this.settle(true)),
      deps.prompt.on('cancelled', () => this.settle(false)),
      deps.screenChanges.on('screenChangeRefused', request => { void this.completeHeldScreenChange(request); }),
      deps.screenChanges.on('screenChanged', screen => {
        if (this.pending && this.pending.screenId !== screen.id) this.closeQuestion();
      }),
    ];
  }

  // Resolves true when nothing would be lost, or when the user chose to discard the staged endpoints.
  async confirmDiscard(screen: IScreenIdentity): Promise<boolean> {
    const changes = this.deps.policy.unlockedChangesOn(screen);
    if (changes.length === 0) return true;
    this.settle(false);
    const discard = await new Promise<boolean>(settle => {
      this.pending = Object.freeze({ screenId: screen.id, settle });
      this.deps.prompt.open(changes);
    });
    if (discard) this.deps.refineScreens.find(refine => refine.id === screen.id)?.session?.abandonRefinement();
    return discard;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.closeQuestion();
  }

  private async completeHeldScreenChange({ from, to }: IScreenChangeRequest): Promise<void> {
    if (this.deps.policy.holdOn(from)?.kind !== 'unlocked-changes') return;
    if (await this.confirmDiscard(from) && this.deps.navigation.activeScreen.id === from.id) {
      this.deps.navigation.activate(to.id);
    }
  }

  private closeQuestion(): void {
    if (this.pending) this.deps.prompt.close();
    this.settle(false);
  }

  private settle(discard: boolean): void {
    const pending = this.pending;
    this.pending = null;
    pending?.settle(discard);
  }
}
