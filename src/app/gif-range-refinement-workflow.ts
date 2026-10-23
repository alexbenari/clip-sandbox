import type { CapturedRangeId } from '../domain/captured-range.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { IScreenNavigation } from './collection-refinement-workflow.js';
import type { IEventSource } from './event-source.js';
import type { GifExtractionSession } from './gif-extraction-session.js';
import type { RefineLeaveWorkflow } from './refine-leave-workflow.js';

export interface ICaptureList extends IEventSource<{ refineRequested: CapturedRangeId }> {
  focusRange(rangeId: CapturedRangeId): void;
}

type GifRangeRefinementDependencies = Readonly<{
  session: Pick<GifExtractionSession, 'beginRefinement'> | null;
  captureList: ICaptureList | null;
  refineScreen: IEventSource<{ backRequested: CapturedRangeId | null }> & Readonly<{ id: string }>;
  extractionScreenId: string;
  navigation: Pick<IScreenNavigation, 'activate'>;
  stagedChanges: Pick<RefineLeaveWorkflow, 'confirmDiscard'>;
  reporter: Pick<ActivityReporter, 'failure'>;
}>;

export class GifRangeRefinementWorkflow {
  private revision = 0;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly refinement: GifRangeRefinementDependencies) {
    this.unsubscribes = [
      refinement.refineScreen.on('backRequested', rangeId => { void this.backToExtraction(rangeId); }),
      ...(refinement.captureList
        ? [refinement.captureList.on('refineRequested', rangeId => { void this.refine(rangeId); })]
        : []),
    ];
  }

  async refine(rangeId: CapturedRangeId): Promise<void> {
    if (!await this.refinement.stagedChanges.confirmDiscard(this.refinement.refineScreen)) return;
    const revision = ++this.revision;
    const result = await this.refinement.session?.beginRefinement(rangeId);
    if (revision !== this.revision) return;
    if (result?.kind === 'started') this.refinement.navigation.activate(this.refinement.refineScreen.id);
    else if (result?.kind === 'rejected') this.refinement.reporter.failure(result.message);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private async backToExtraction(rangeId: CapturedRangeId | null): Promise<void> {
    if (!await this.refinement.stagedChanges.confirmDiscard(this.refinement.refineScreen)) return;
    this.refinement.navigation.activate(this.refinement.extractionScreenId);
    if (rangeId) this.refinement.captureList?.focusRange(rangeId);
  }
}
