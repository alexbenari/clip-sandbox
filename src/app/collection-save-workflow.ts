import { Collection } from '../domain/collection.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppText } from './app-text.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { NewCollectionNameCheck } from './new-collection-name-check.js';
import type { OpenFolderRefreshSession } from './open-folder-refresh-session.js';
import type { PipelineSession } from './pipeline-session.js';

export type SaveOutcome = 'saved' | 'cancelled' | 'failed';
export type SaveAsNewOutcome = Exclude<SaveOutcome, 'failed'>;

export interface ISaveAsNewDialog extends IEventSource<{ confirmed: string; cancelled: void }> {
  open(options: { isPipelineMode: boolean }): void;
  close(): void;
  showValidationError(text: string, options: { focusInput: boolean }): void;
}

type CollectionSaveDependencies = Readonly<{
  pipelineSession: Pick<PipelineSession, 'pipeline' | 'currentClipSequence' | 'isPipelineMode'
    | 'activeCollectionFilename' | 'collectionFromCurrentSequence' | 'markCurrentSequenceSavedAs'>;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  saveAsNewDialog: ISaveAsNewDialog;
  toolbar: IEventSource<{ saveRequested: void; saveAsNewRequested: void }>;
  nameCheck: Pick<NewCollectionNameCheck, 'problemText'>;
  grid: { invalidateView(cacheKey: string): void; retagActiveView(cacheKey: string | null): void };
  collectionView: Pick<CollectionViewWorkflow, 'activeCacheKey' | 'refreshSelector' | 'refreshToolbar'>;
  folderRefresh: Pick<OpenFolderRefreshSession, 'afterCollectionSaved'>;
  reporter: Pick<ActivityReporter, 'success'>;
  appText: Pick<AppText, 'savedCollectionFileText'>;
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
    const { pipelineSession } = this.save;
    if (!pipelineSession.currentClipSequence || !pipelineSession.pipeline) return 'failed';
    if (pipelineSession.isPipelineMode()) return this.saveAsNew();
    const collection = await this.writeCurrentSequence(pipelineSession.activeCollectionFilename());
    if (!collection) return 'failed';
    pipelineSession.markCurrentSequenceSavedAs(collection);
    await this.save.folderRefresh.afterCollectionSaved();
    this.save.collectionView.refreshSelector();
    this.save.collectionView.refreshToolbar();
    this.save.reporter.success(this.save.appText.savedCollectionFileText(collection.filename || ''));
    return 'saved';
  }

  // Resolves when the user saves or cancels; a failed save keeps the dialog open and the wait pending.
  saveAsNew(): Promise<SaveAsNewOutcome> {
    if (this.saveAsNewWait) return this.saveAsNewWait.outcome;
    let settle: (outcome: SaveAsNewOutcome) => void = () => undefined;
    const outcome = new Promise<SaveAsNewOutcome>(resolve => { settle = resolve; });
    this.saveAsNewWait = { outcome, settle };
    this.save.saveAsNewDialog.open({ isPipelineMode: this.save.pipelineSession.isPipelineMode() });
    return outcome;
  }

  cancelSaveAsNew(): void {
    this.save.saveAsNewDialog.close();
    this.settleSaveAsNew('cancelled');
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.settleSaveAsNew('cancelled');
  }

  private async confirmSaveAsNew(rawName: string): Promise<void> {
    const { pipelineSession, collectionView } = this.save;
    const problem = this.save.nameCheck.problemText(rawName);
    if (problem) {
      this.save.saveAsNewDialog.showValidationError(problem, { focusInput: true });
      return;
    }
    const filename = Collection.filenameFromCollectionName(rawName);
    const collection = await this.writeCurrentSequence(filename);
    if (!collection) return;
    const previousCacheKey = collectionView.activeCacheKey();
    pipelineSession.markCurrentSequenceSavedAs(collection);
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
    const { pipelineSession } = this.save;
    const pipeline = pipelineSession.pipeline;
    if (!pipelineSession.currentClipSequence || !pipeline) return null;
    const collection = pipelineSession.collectionFromCurrentSequence(filename);
    if (!collection) return null;
    try {
      await this.save.fileWriter.write(collection);
    } catch {
      return null;
    }
    pipeline.upsertCollection(collection);
    return collection;
  }
}
