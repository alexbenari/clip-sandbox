import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppText } from './app-text.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { NewCollectionNameCheck } from './new-collection-name-check.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export type AddToCollectionTarget =
  | Readonly<{ kind: 'new'; name: string }>
  | Readonly<{ kind: 'existing'; collectionFilename: string | null }>;

export type CollectionDestinationChoice = Readonly<{ label: string; value: string; collectionFilename: string | null }>;

export interface IDestinationChoiceBuilder {
  buildChoices(input: { pipeline: Pipeline | null; activeCollectionFilename: string }): CollectionDestinationChoice[];
}

export interface IAddToCollectionDialog extends IEventSource<{ confirmed: AddToCollectionTarget }> {
  open(options: { choices: CollectionDestinationChoice[]; hasSelection: boolean; startWithNewCollection: boolean }): void;
  close(): void;
  showValidationError(text: string, options: { focusNameInput: boolean }): void;
}

type AddedCollection = Extract<ReturnType<Pipeline['addClipsToCollection']>, { ok: true }>;

type AddToCollectionDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'currentClipSequence' | 'activeCollectionFilename' | 'clipNamesForIdsInOrder'>;
  grid: { getSelectedClipIds(): string[]; invalidateView(cacheKey: string): void };
  dialog: IAddToCollectionDialog;
  destinationChoices: IDestinationChoiceBuilder;
  toolbar: IEventSource<{ addToCollectionRequested: void }>;
  nameCheck: Pick<NewCollectionNameCheck, 'check'>;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  collectionView: Pick<CollectionViewWorkflow, 'cacheKeyFor' | 'refreshSelector' | 'refreshToolbar'>;
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'addedSelectedClipsText' | 'addSelectedClipsFailedText'>;
}>;

export class AddToCollectionWorkflow {
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly add: AddToCollectionDependencies) {
    this.unsubscribes = [
      add.toolbar.on('addToCollectionRequested', () => this.openDialog()),
      add.dialog.on('confirmed', target => { void this.addSelectedClips(target, { fromDialog: true }); }),
    ];
  }

  openDialog({ startWithNewCollection = false }: { startWithNewCollection?: boolean } = {}): void {
    const { pipelineWorkingCopy } = this.add;
    if (!pipelineWorkingCopy.pipeline) return;
    this.add.dialog.open({
      choices: this.destinationChoices(),
      hasSelection: this.add.grid.getSelectedClipIds().length > 0,
      startWithNewCollection,
    });
  }

  destinationChoices(): CollectionDestinationChoice[] {
    const { pipelineWorkingCopy } = this.add;
    return this.add.destinationChoices.buildChoices({
      pipeline: pipelineWorkingCopy.pipeline,
      activeCollectionFilename: pipelineWorkingCopy.activeCollectionFilename(),
    });
  }

  async addSelectedClips(target: AddToCollectionTarget, { fromDialog = false }: { fromDialog?: boolean } = {}): Promise<void> {
    const { pipelineWorkingCopy } = this.add;
    const pipeline = pipelineWorkingCopy.pipeline;
    if (!pipelineWorkingCopy.currentClipSequence || !pipeline) return;
    const selectedClipNames = pipelineWorkingCopy.clipNamesForIdsInOrder(this.add.grid.getSelectedClipIds());
    if (selectedClipNames.length === 0) return;
    const collectionFilename = this.destinationFilename(target, fromDialog);
    if (!collectionFilename) return;

    const added = pipeline.addClipsToCollection({ collectionFilename, clipNames: selectedClipNames });
    if (!added.ok) return;
    if (added.isNoOp) {
      this.reportAdded(added);
      return;
    }
    try {
      await this.add.fileWriter.write(added.collection);
    } catch (error) {
      this.undoAddition(pipeline, added);
      this.reportFailure(added.destinationName, error, fromDialog);
      return;
    }
    this.add.grid.invalidateView(this.add.collectionView.cacheKeyFor(added.collection));
    this.reportAdded(added);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private destinationFilename(target: AddToCollectionTarget, fromDialog: boolean): string | null {
    if (target.kind === 'existing') return String(target.collectionFilename || '').trim();
    const nameCheck = this.add.nameCheck.check(target.name);
    if (nameCheck.kind === 'rejected') {
      if (fromDialog && nameCheck.message) this.add.dialog.showValidationError(nameCheck.message, { focusNameInput: true });
      return null;
    }
    if (nameCheck.filename === this.add.pipelineWorkingCopy.activeCollectionFilename()) return null;
    return nameCheck.filename;
  }

  private undoAddition(pipeline: Pipeline, added: AddedCollection): void {
    if (added.previousCollection) pipeline.upsertCollection(added.previousCollection);
    else if (added.filename) pipeline.removeCollection(added.filename);
  }

  private reportAdded(added: AddedCollection): void {
    this.add.dialog.close();
    this.add.collectionView.refreshSelector();
    this.add.collectionView.refreshToolbar();
    this.add.reporter.success(
      this.add.appText.addedSelectedClipsText(added.destinationName, added.addedCount, added.skippedCount), 4000);
  }

  private reportFailure(destinationName: string, error: unknown, fromDialog: boolean): void {
    if (fromDialog) this.add.dialog.close();
    const failureDetail = error || 'save-failed';
    this.add.reporter.failure(this.add.appText.addSelectedClipsFailedText(destinationName || '', failureDetail), {
      affected: destinationName || 'Add to collection',
      recovery: 'Check folder access, then add the selected clips again.',
      technicalDetails: this.add.reporter.technicalDetailsOf(failureDetail),
    });
  }
}
