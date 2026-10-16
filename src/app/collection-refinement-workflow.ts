import type { CapturedRangeId } from '../domain/captured-range.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { ICollectionClipRefinementRequest, ICollectionClipRefinementService } from './collection-clip-refinement.js';
import type { IEventSource } from './event-source.js';
import type { CollectionClipRefinementSession } from './collection-clip-refinement-session.js';
import type { PipelineSession } from './pipeline-session.js';

export interface IScreenNavigation {
  activate(screenId: string): void;
  readonly activeScreen: Readonly<{ id: string }>;
}

export interface IRefinePreparationScreen extends IEventSource<{ backRequested: CapturedRangeId | null }> {
  readonly id: string;
  showPreparation(message: string | null, inProgress?: boolean): void;
}

type CollectionRefinementDependencies = Readonly<{
  refinementSession: Pick<CollectionClipRefinementSession, 'setExtractionDestination' | 'openCollectionSource'
    | 'importCollectionRange' | 'abandonRefinement' | 'beginRefinement'> | null;
  sourceLookup: Pick<ICollectionClipRefinementService, 'resolve'> | null;
  refineScreen: IRefinePreparationScreen;
  refinedClipList: IEventSource<{ refineRequested: CapturedRangeId }> | null;
  navigation: IScreenNavigation;
  collectionScreenId: string;
  pipelineSession: Pick<PipelineSession, 'hasDirtyClipSequenceChanges' | 'activeCollectionFilename'>;
  openFolder: Pick<AppSessionState, 'currentFolderSession'>;
  folders: { canMutateDisk(folderSession: unknown): folderSession is { folderPath: string } };
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  reporter: Pick<ActivityReporter, 'failure'>;
}>;

export class CollectionRefinementWorkflow {
  private revision = 0;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly refinement: CollectionRefinementDependencies) {
    this.unsubscribes = [
      refinement.refineScreen.on('backRequested', () => this.backToCollection()),
      ...(refinement.refinedClipList
        ? [refinement.refinedClipList.on('refineRequested', rangeId => { void this.refineAgain(rangeId); })]
        : []),
    ];
  }

  async start(request: ICollectionClipRefinementRequest, collectionFilename: string): Promise<void> {
    const { refinementSession: session, sourceLookup, refineScreen, navigation, reporter } = this.refinement;
    if (!session || !sourceLookup) return;
    const revision = ++this.revision;
    try {
      if (this.refinement.pipelineSession.hasDirtyClipSequenceChanges) {
        reporter.failure('Save or discard the current changes before refining a clip.');
        return;
      }
      session.setExtractionDestination(collectionFilename
        ? { kind: 'collection', folderPath: request.folderPath, collectionFilename }
        : { kind: 'folder', folderPath: request.folderPath });
      refineScreen.showPreparation(`Finding the original movie for ${request.filename}…`);
      navigation.activate(refineScreen.id);
      const resolved = await sourceLookup.resolve(request);
      if (this.isSuperseded(revision)) return;
      if (resolved.kind === 'cancelled') {
        navigation.activate(this.refinement.collectionScreenId);
        refineScreen.showPreparation(null);
        return;
      }
      if (request.folderPath !== this.openFolderPath()
        || collectionFilename !== this.refinement.pipelineSession.activeCollectionFilename()) return;
      refineScreen.showPreparation('Opening the original movie…');
      await session.openCollectionSource(resolved.source);
      if (this.isSuperseded(revision)) return;
      refineScreen.showPreparation('Preparing exact frames and checking the clip range…');
      const started = await session.importCollectionRange(resolved.range);
      if (this.isSuperseded(revision)) {
        session.abandonRefinement();
        return;
      }
      if (started.kind === 'rejected') {
        refineScreen.showPreparation(started.message, false);
        reporter.failure(started.message);
      } else refineScreen.showPreparation(null);
    } catch (error) {
      if (this.isSuperseded(revision)) return;
      const message = error instanceof Error ? error.message : 'The clip could not be opened for refinement.';
      refineScreen.showPreparation(message, false);
      reporter.failure(message);
      void this.refinement.diagnostics.logRuntimeError(message, error);
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private backToCollection(): void {
    const { navigation, collectionScreenId, refineScreen } = this.refinement;
    navigation.activate(collectionScreenId);
    if (navigation.activeScreen.id === collectionScreenId) {
      this.revision += 1;
      refineScreen.showPreparation(null);
    }
  }

  private async refineAgain(rangeId: CapturedRangeId): Promise<void> {
    const started = await this.refinement.refinementSession?.beginRefinement(rangeId);
    if (started?.kind === 'rejected') this.refinement.reporter.failure(started.message);
  }

  private isSuperseded(revision: number): boolean {
    return revision !== this.revision || this.refinement.navigation.activeScreen.id !== this.refinement.refineScreen.id;
  }

  private openFolderPath(): string | null {
    const folderSession = this.refinement.openFolder.currentFolderSession;
    return this.refinement.folders.canMutateDisk(folderSession) ? folderSession.folderPath : null;
  }
}
