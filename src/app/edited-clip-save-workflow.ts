import type { Clip } from '../domain/clip.js';
import type { ZoomEditComposition } from '../domain/zoom-edit-composition.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { ClipFileReplacement } from './clip-file-replacement.js';
import type { CreatedClipInsertion } from './created-clip-insertion.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type {
  IEditedClipSaveProgress,
  IEditedClipSaveService,
  ISavedClipEntry,
  EditedClipSaveOutcome,
  SavedEditedClip,
} from './edited-clip-save-service.js';
import type { IZoomEditModeSnapshot, IZoomEditStagedSelection } from './zoom-edit-mode-session.js';
import type { ZoomEditModeText } from './zoom-edit-mode-text.js';

export interface ISaveEditsPrompt extends IEventSource<{ confirmed: EditedClipSaveOutcome; cancelled: void }> {
  open(request: Readonly<{ filename: string; edits: ZoomEditComposition }>): void;
  close(): void;
}

export interface ISavedClipSources {
  clipSourceOf(file: ISavedClipEntry): ClipSource;
}

export interface IClipEditsToSave {
  readonly clip: Clip;
  readonly folder: FolderAccess;
  readonly session: IEventSource<{ changed: IZoomEditModeSnapshot }> & {
    readonly snapshot: IZoomEditModeSnapshot;
    stagedSelection(): IZoomEditStagedSelection | null;
    stagedEdits(): ZoomEditComposition;
  };
}

export type EditedClipSaveStatus =
  | Readonly<{ kind: 'waiting-for-movie' }>
  | Readonly<{ kind: 'saving'; progress: IEditedClipSaveProgress | null }>;

export interface IEditedClipSaveView {
  statusChanged(status: EditedClipSaveStatus): void;
  // False when the edit had already ended, so the saved clip is not shown.
  endEdit(): boolean;
}

export type EditedClipSaveEnd = 'not-saved' | 'saved' | 'cancelled' | 'failed';

type SaveRun = { cancelled: boolean; stopWaiting: (() => void) | null };

type EditedClipSaveWorkflowDependencies = Readonly<{
  saves: IEditedClipSaveService;
  saveDialog: ISaveEditsPrompt;
  savedClipSources: ISavedClipSources;
  createdClips: Pick<CreatedClipInsertion, 'insert'>;
  replacements: Pick<ClipFileReplacement, 'replace'>;
  reporter: Pick<ActivityReporter, 'success' | 'information' | 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  text: ZoomEditModeText;
}>;

export class EditedClipSaveWorkflow {
  private pendingOutcome: ((outcome: EditedClipSaveOutcome | null) => void) | null = null;
  private run: SaveRun | null = null;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: EditedClipSaveWorkflowDependencies) {
    this.unsubscribes = [
      deps.saveDialog.on('confirmed', outcome => this.settleOutcome(outcome)),
      deps.saveDialog.on('cancelled', () => this.settleOutcome(null)),
    ];
  }

  async save(edit: IClipEditsToSave, view: IEditedClipSaveView): Promise<EditedClipSaveEnd> {
    const edits = edit.session.stagedEdits();
    const outcome = await this.askOutcome(edit.clip.name, edits);
    if (!outcome || this.run) return 'not-saved';
    const run: SaveRun = { cancelled: false, stopWaiting: null };
    this.run = run;
    let saved: SavedEditedClip;
    try {
      if (edits.needsSourceMovie && !(await this.movieSettled(edit, run, view))) return 'cancelled';
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
      .catch(error => this.deps.diagnostics.logRuntimeError('Cancelling a edited clip save failed.', error));
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.stop();
  }

  private askOutcome(filename: string, edits: ZoomEditComposition): Promise<EditedClipSaveOutcome | null> {
    this.settleOutcome(null);
    return new Promise(settle => {
      this.pendingOutcome = settle;
      this.deps.saveDialog.open({ filename, edits });
    });
  }

  private settleOutcome(outcome: EditedClipSaveOutcome | null): void {
    const pending = this.pendingOutcome;
    this.pendingOutcome = null;
    pending?.(outcome);
  }

  // Edits that need the source movie wait while it is still being found or prepared, so they can use its frames.
  private async movieSettled(edit: IClipEditsToSave, run: SaveRun, view: IEditedClipSaveView): Promise<boolean> {
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

  private requestOf(edit: IClipEditsToSave, edits: ZoomEditComposition, outcome: EditedClipSaveOutcome) {
    const selection = edit.session.stagedSelection();
    if (!selection) throw new Error('Zoom edit mode has no staged range to save.');
    const { source, sessionId, startFrame, endFrame } = selection;
    return { folder: edit.folder, filename: edit.clip.name, source, sessionId, startFrame, endFrame, edits: edits.edits, outcome };
  }

  private reportSaved(previousFilename: string, saved: SavedEditedClip, edits: ZoomEditComposition): void {
    const { reporter, text } = this.deps;
    reporter.success(text.saved(previousFilename, saved, edits));
    if (saved.warning) reporter.information(text.sourceInfoNotSaved(saved.filename));
  }

  private async showInViews(original: Clip, saved: SavedEditedClip): Promise<void> {
    const { savedClipSources, createdClips, replacements } = this.deps;
    const source = savedClipSources.clipSourceOf(saved.entry);
    if (saved.outcome === 'kept-both') {
      if (!createdClips.insert(original, source)) this.reportNotShown(saved.filename);
      return;
    }
    if (!(await replacements.replace(original, source))) this.reportNotShown(saved.filename);
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
}
