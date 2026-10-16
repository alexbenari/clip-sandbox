import { Collection } from '../domain/collection.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppText } from './app-text.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { NewCollectionNameCheck } from './new-collection-name-check.js';
import type { OpenFolderRefresher } from './open-folder-refresher.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export type SaveOutcome = 'saved' | 'cancelled' | 'failed';
export type SaveAsNewOutcome = Exclude<SaveOutcome, 'failed'>;

export interface ISaveAsNewDialog extends IEventSource<{ confirmed: string; cancelled: void }> {
  open(options: { isPipelineMode: boolean }): void;
  close(): void;
  showValidationError(text: string, options: { focusInput: boolean }): void;
}

type CollectionSaveDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'currentClipSequence' | 'isPipelineMode'
    | 'activeCollectionFilename' | 'collectionFromCurrentSequence' | 'markCurrentSequenceSavedAs'>;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  saveAsNewDialog: ISaveAsNewDialog;
  toolbar: IEventSource<{ saveRequested: void; saveAsNewRequested: void }>;
  nameCheck: Pick<NewCollectionNameCheck, 'problemText'>;
  grid: { invalidateView(cacheKey: string): void; retagActiveView(cacheKey: string | null): void };
  collectionView: Pick<CollectionViewWorkflow, 'activeCacheKey' | 'refreshSelector' | 'refreshToolbar'>;
  folderRefresh: Pick<OpenFolderRefresher, 'afterCollectionSaved'>;
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'savedCollectionFileText' | 'saveCollectionFailedText'>;
}>;

type SaveAsNewWait = Readonly<{ outcome: Promise<SaveAsNewOutcome>; settle: (outcome: SaveAsNewOutcome) => void }>;

export class CollectionSaveWorkflow {
  private saveAsNewWait: SaveAsNewWait | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly save: CollectionSaveDependencies) {
    this.unsubscribes = [
      save.toolbar.on('saveRequested', () => { void this.saveActive(); }),
      save.toolbar.on('saveAsNewRequested', () => { void this.saveAsNew(); }),
      save.saveAsNewDialog.on('confirmed', name => { void this.confirmSaveAsNew(name); }),
      save.saveAsNewDialog.on('cancelled', () => this.saveAsNewCancelled()),
    ];
  }

  async saveActive(): Promise<SaveOutcome> {
    const { pipelineWorkingCopy } = this.save;
    if (!pipelineWorkingCopy.currentClipSequence || !pipelineWorkingCopy.pipeline) return 'failed';
    if (pipelineWorkingCopy.isPipelineMode()) return this.saveAsNew();
    const collection = await this.writeCurrentSequence(pipelineWorkingCopy.activeCollectionFilename());
    if (!collection) return 'failed';
    pipelineWorkingCopy.markCurrentSequenceSavedAs(collection);
    await this.save.folderRefresh.afterCollectionSaved();
    this.save.collectionView.refreshSelector();
    this.save.collectionView.refreshToolbar();
    this.save.reporter.success(this.save.appText.savedCollectionFileText(collection.filename || ''));
    return 'saved';
  }

  // Resolves when the user saves or cancels; a failed save keeps the dialog open and the wait pending.
  saveAsNew(): Promise<SaveAsNewOutcome> {
    const dialogOpen = this.saveAsNewWait !== null;
    // A request made while the dialog is open takes it over, so only the latest flow resumes after the save.
    this.settleSaveAsNew('cancelled');
    let settle: (outcome: SaveAsNewOutcome) => void = () => undefined;
    const outcome = new Promise<SaveAsNewOutcome>(resolve => { settle = resolve; });
    this.saveAsNewWait = { outcome, settle };
    // Reopening would clear the name the user may already be typing.
    if (!dialogOpen) this.save.saveAsNewDialog.open({ isPipelineMode: this.save.pipelineWorkingCopy.isPipelineMode() });
    return outcome;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.settleSaveAsNew('cancelled');
  }

  private async confirmSaveAsNew(rawName: string): Promise<void> {
    const { pipelineWorkingCopy, collectionView } = this.save;
    const problem = this.save.nameCheck.problemText(rawName);
    if (problem) {
      this.save.saveAsNewDialog.showValidationError(problem, { focusInput: true });
      return;
    }
    const filename = Collection.filenameFromCollectionName(rawName);
    const collection = await this.writeCurrentSequence(filename);
    if (!collection) return;
    const previousCacheKey = collectionView.activeCacheKey();
    pipelineWorkingCopy.markCurrentSequenceSavedAs(collection);
    await this.save.folderRefresh.afterCollectionSaved();
    this.save.grid.invalidateView(previousCacheKey);
    this.save.grid.retagActiveView(collectionView.activeCacheKey());
    this.save.saveAsNewDialog.close();
    collectionView.refreshSelector();
    collectionView.refreshToolbar();
    this.save.reporter.success(this.save.appText.savedCollectionFileText(filename));
    this.settleSaveAsNew('saved');
  }

  private saveAsNewCancelled(): void {
    this.settleSaveAsNew('cancelled');
    this.save.collectionView.refreshSelector();
  }

  private settleSaveAsNew(outcome: SaveAsNewOutcome): void {
    const wait = this.saveAsNewWait;
    this.saveAsNewWait = null;
    wait?.settle(outcome);
  }

  private async writeCurrentSequence(filename: string): Promise<Collection | null> {
    const { pipelineWorkingCopy } = this.save;
    const pipeline = pipelineWorkingCopy.pipeline;
    if (!pipelineWorkingCopy.currentClipSequence || !pipeline) return null;
    const collection = pipelineWorkingCopy.collectionFromCurrentSequence(filename);
    if (!collection) return null;
    try {
      await this.save.fileWriter.write(collection);
    } catch (error) {
      this.save.reporter.failure(this.save.appText.saveCollectionFailedText(filename), {
        affected: filename,
        recovery: 'Check folder access and free disk space, then save again.',
        technicalDetails: this.save.reporter.technicalDetailsOf(error),
      });
      return null;
    }
    pipeline.upsertCollection(collection);
    return collection;
  }
}
