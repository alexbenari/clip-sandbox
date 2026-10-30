import type { Clip } from '../domain/clip.js';
import type { ZoomEditComposition } from '../domain/zoom-edit-composition.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { ClipFileReplacement, FailedCollectionRename } from './clip-file-replacement.js';
import type { CreatedClipInsertion } from './created-clip-insertion.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type {
  IRefinedClipSaveProgress,
  IRefinedClipSaveService,
  ISavedClipEntry,
  RefinedClipSaveOutcome,
  SavedRefinedClip,
} from './refined-clip-save-service.js';
import type { IZoomEditModeSnapshot, IZoomEditStagedSelection } from './zoom-edit-mode-session.js';
import type { ZoomEditModeText } from './zoom-edit-mode-text.js';

export interface ISaveRefinementPrompt extends IEventSource<{ confirmed: RefinedClipSaveOutcome; cancelled: void }> {
  open(request: Readonly<{ filename: string; edits: ZoomEditComposition }>): void;
  close(): void;
}

export interface ISavedClipSources {
  clipSourceOf(file: ISavedClipEntry): ClipSource;
}

export interface IRefinedClipEdit {
  readonly clip: Clip;
  readonly folder: FolderAccess;
  readonly session: IEventSource<{ changed: IZoomEditModeSnapshot }> & {
    readonly snapshot: IZoomEditModeSnapshot;
    stagedSelection(): IZoomEditStagedSelection | null;
    stagedEdits(): ZoomEditComposition;
  };
}

export type RefinedClipSaveStatus =
  | Readonly<{ kind: 'waiting-for-movie' }>
  | Readonly<{ kind: 'saving'; progress: IRefinedClipSaveProgress | null }>;

export interface IRefinedClipSaveView {
  statusChanged(status: RefinedClipSaveStatus): void;
  // False when the edit had already ended, so the saved clip is not shown.
  endEdit(): boolean;
}

export type RefinedClipSaveEnd = 'not-saved' | 'saved' | 'cancelled' | 'failed';

type SaveRun = { cancelled: boolean; stopWaiting: (() => void) | null };

type RefinedClipSaveWorkflowDependencies = Readonly<{
  saves: IRefinedClipSaveService;
  saveDialog: ISaveRefinementPrompt;
  savedClipSources: ISavedClipSources;
  createdClips: Pick<CreatedClipInsertion, 'insert'>;
  replacements: Pick<ClipFileReplacement, 'replace'>;
  reporter: Pick<ActivityReporter, 'success' | 'information' | 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  text: ZoomEditModeText;
}>;

export class RefinedClipSaveWorkflow {
  private pendingOutcome: ((outcome: RefinedClipSaveOutcome | null) => void) | null = null;
  private run: SaveRun | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: RefinedClipSaveWorkflowDependencies) {
    this.unsubscribes = [
      deps.saveDialog.on('confirmed', outcome => this.settleOutcome(outcome)),
      deps.saveDialog.on('cancelled', () => this.settleOutcome(null)),
    ];
  }

  async save(edit: IRefinedClipEdit, view: IRefinedClipSaveView): Promise<RefinedClipSaveEnd> {
    const edits = edit.session.stagedEdits();
    const outcome = await this.askOutcome(edit.clip.name, edits);
    if (!outcome || this.run) return 'not-saved';
    const run: SaveRun = { cancelled: false, stopWaiting: null };
    this.run = run;
    let saved: SavedRefinedClip;
    try {
      if (!(await this.movieSettled(edit, run, view))) return 'cancelled';
      view.statusChanged(Object.freeze({ kind: 'saving', progress: null }));
      saved = await this.deps.saves.save(this.requestOf(edit, edits, outcome), progress => {
        if (this.run === run) view.statusChanged(Object.freeze({ kind: 'saving', progress }));
      });
    } catch (error) {
      if (run.cancelled) return 'cancelled';
      this.reportSaveFailure(edit.clip, error);
      return 'failed';
    } finally {
      if (this.run === run) this.run = null;
    }
    const editWasOpen = view.endEdit();
    this.reportSaved(edit.clip.name, saved, edits);
    if (editWasOpen) await this.showInViews(edit.clip, saved);
    return 'saved';
  }

  stop(): void {
    if (this.pendingOutcome) this.deps.saveDialog.close();
    this.settleOutcome(null);
    const run = this.run;
    if (!run || run.cancelled) return;
    run.cancelled = true;
    if (run.stopWaiting) {
      run.stopWaiting();
      return;
    }
    void this.deps.saves.cancelSave()
      .catch(error => this.deps.diagnostics.logRuntimeError('Cancelling a refined clip save failed.', error));
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.stop();
  }

  private askOutcome(filename: string, edits: ZoomEditComposition): Promise<RefinedClipSaveOutcome | null> {
    this.settleOutcome(null);
    return new Promise(settle => {
      this.pendingOutcome = settle;
      this.deps.saveDialog.open({ filename, edits });
    });
  }

  private settleOutcome(outcome: RefinedClipSaveOutcome | null): void {
    const pending = this.pendingOutcome;
    this.pendingOutcome = null;
    pending?.(outcome);
  }

  // A save waits while the source movie is still being found or prepared, so it can use the movie's frames.
  private async movieSettled(edit: IRefinedClipEdit, run: SaveRun, view: IRefinedClipSaveView): Promise<boolean> {
    if (!edit.session.snapshot.extensionPending) return true;
    view.statusChanged(Object.freeze({ kind: 'waiting-for-movie' }));
    await new Promise<void>(resolve => {
      const unsubscribe = edit.session.on('changed', snapshot => {
        if (!snapshot.extensionPending) stopWaiting();
      });
      const stopWaiting = () => {
        unsubscribe();
        run.stopWaiting = null;
        resolve();
      };
      run.stopWaiting = stopWaiting;
    });
    return !run.cancelled;
  }

  private requestOf(edit: IRefinedClipEdit, edits: ZoomEditComposition, outcome: RefinedClipSaveOutcome) {
    const selection = edit.session.stagedSelection();
    if (!selection) throw new Error('Zoom edit mode has no staged range to save.');
    const { source, sessionId, startFrame, endFrame } = selection;
    return { folder: edit.folder, filename: edit.clip.name, source, sessionId, startFrame, endFrame, loopify: edits.includes('loopify'), outcome };
  }

  private reportSaved(previousFilename: string, saved: SavedRefinedClip, edits: ZoomEditComposition): void {
    const { reporter, text } = this.deps;
    reporter.success(text.saved(previousFilename, saved, edits));
    if (saved.warning) reporter.information(text.sourceInfoNotSaved(saved.filename));
  }

  private async showInViews(original: Clip, saved: SavedRefinedClip): Promise<void> {
    const { savedClipSources, createdClips, replacements } = this.deps;
    const previousFilename = original.name;
    const source = savedClipSources.clipSourceOf(saved.entry);
    if (saved.outcome === 'kept-both') {
      if (!createdClips.insert(original, source)) this.reportNotShown(saved.filename);
      return;
    }
    const replaced = await replacements.replace(original, source);
    if (!replaced) this.reportNotShown(saved.filename);
    else if (replaced.failedCollections.length > 0) this.reportCollectionsNotRenamed(previousFilename, saved.filename, replaced.failedCollections);
  }

  private reportSaveFailure(clip: Clip, error: unknown): void {
    const { reporter, diagnostics, text } = this.deps;
    const problem = text.saveFailed(clip.name);
    reporter.failure(problem, {
      affected: clip.name,
      recovery: text.saveFailedHint(),
      technicalDetails: reporter.technicalDetailsOf(error),
    });
    void diagnostics.logRuntimeError(problem, error);
  }

  private reportNotShown(filename: string): void {
    const { reporter, text } = this.deps;
    reporter.failure(text.savedClipNotShown(filename), { affected: filename, recovery: text.savedClipNotShownRecovery() });
  }

  private reportCollectionsNotRenamed(previousFilename: string, filename: string, failed: readonly FailedCollectionRename[]): void {
    const { reporter, text } = this.deps;
    reporter.failure(text.collectionsNotRenamed(previousFilename, filename, failed.length), {
      affected: failed.map(({ collectionName }) => collectionName).join(', '),
      recovery: text.collectionsNotRenamedRecovery(filename),
      technicalDetails: failed.map(({ collectionName, filename: collectionFile, error }) =>
        `${collectionName} (${collectionFile}): ${reporter.technicalDetailsOf(error)}`).join('\n'),
    });
  }
}
