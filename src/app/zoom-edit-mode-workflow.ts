import type { Clip } from '../domain/clip.js';
import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import type { UnlockedEndpointChange } from './range-refinement-draft.js';
import type { IScreenChangeRequest } from './refine-leave-workflow.js';
import type { IScreenIdentity } from './refine-screen-leave-policy.js';
import type {
  IRefinedClipSaveProgress,
  IRefinedClipSaveService,
  RefinedClipSaveOutcome,
  SavedRefinedClip,
} from './refined-clip-save-service.js';
import type { IScreenNavigation } from './screen-navigation.js';
import type { ZoomEditModeCommand } from './zoom-edit-mode-keys.js';
import type { ZoomEditModeLeavePolicy } from './zoom-edit-mode-leave-policy.js';
import type {
  IZoomEditModeRequest,
  IZoomEditModeSnapshot,
  IZoomEditStagedSelection,
  ZoomEditCommandAnswer,
  ZoomEditExtension,
  ZoomEditJumpSeconds,
} from './zoom-edit-mode-session.js';
import type { ZoomEditModeText } from './zoom-edit-mode-text.js';

export interface IZoomEditSession extends IEventSource<{ changed: IZoomEditModeSnapshot }> {
  readonly snapshot: IZoomEditModeSnapshot;
  stagedSelection(): IZoomEditStagedSelection | null;
  togglePlayback(): Promise<ZoomEditCommandAnswer>;
  step(direction: -1 | 1): Promise<ZoomEditCommandAnswer>;
  jump(seconds: ZoomEditJumpSeconds): Promise<ZoomEditCommandAnswer>;
  markStart(): Promise<ZoomEditCommandAnswer>;
  markEnd(): Promise<ZoomEditCommandAnswer>;
  jumpToStart(): Promise<ZoomEditCommandAnswer>;
  jumpToEnd(): Promise<ZoomEditCommandAnswer>;
  toggleLoop(): Promise<ZoomEditCommandAnswer>;
  dispose(): Promise<void>;
}

export interface IZoomEditSessions {
  begin(request: IZoomEditModeRequest): IZoomEditSession;
}

export type ZoomEditHint = Readonly<{ keys: string; status: string | null }>;

export interface IZoomEditSurface extends IEventSource<{ closeRequested: void }> {
  isMuted(): boolean;
  showEditSurface(): boolean;
  showEditHint(hint: ZoomEditHint): void;
  hideEditSurface(): void;
}

export interface IZoomClipView {
  openClip(clip: Clip): boolean;
  close(): void;
}

export interface ISaveRefinementPrompt extends IEventSource<{ confirmed: RefinedClipSaveOutcome; cancelled: void }> {
  open(filename: string): void;
  close(): void;
}

export interface IDiscardZoomEditPrompt extends IEventSource<{ confirmed: void; cancelled: void }> {
  open(changes: readonly UnlockedEndpointChange[]): void;
  close(): void;
}

export interface IZoomEditScreenChanges extends IEventSource<{
  screenChangeRefused: IScreenChangeRequest;
  screenChanged: IScreenIdentity;
}> {}

type ZoomEditModeDependencies = Readonly<{
  sessions: IZoomEditSessions;
  saves: IRefinedClipSaveService;
  activeEdit: Pick<ActiveZoomEdit, 'begin' | 'end'>;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'resolveClip'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  zoom: IZoomEditSurface;
  zoomClips: IZoomClipView;
  keys: IEventSource<{ commandRequested: ZoomEditModeCommand }>;
  saveDialog: ISaveRefinementPrompt;
  discardPrompt: IDiscardZoomEditPrompt;
  screens: IZoomEditScreenChanges;
  navigation: Pick<IScreenNavigation, 'activate' | 'activeScreen'>;
  policy: Pick<ZoomEditModeLeavePolicy, 'canLeave'>;
  collectionScreenId: string;
  fullScreen: { isDocumentFullScreen(): boolean };
  folderRefresh: { afterZoomEditModeEnded(): Promise<void> };
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  text: ZoomEditModeText;
}>;

type Saving = {
  waitingForMovie: boolean;
  progress: IRefinedClipSaveProgress | null;
  cancelled: boolean;
  stopWaiting: (() => void) | null;
};

type EditMode = {
  readonly clip: Clip;
  readonly folder: FolderAccess;
  readonly session: IZoomEditSession;
  unsubscribe: () => void;
  shown: IZoomEditModeSnapshot;
  notice: string | null;
  saving: Saving | null;
};

export class ZoomEditModeWorkflow {
  private mode: EditMode | null = null;
  private pendingSave: ((outcome: RefinedClipSaveOutcome | null) => void) | null = null;
  private pendingDiscard: ((discard: boolean) => void) | null = null;
  private disposed = false;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: ZoomEditModeDependencies) {
    this.unsubscribes = [
      deps.keys.on('commandRequested', command => { void this.perform(command); }),
      deps.zoom.on('closeRequested', () => { void this.closeZoom(); }),
      deps.saveDialog.on('confirmed', outcome => this.settleSave(outcome)),
      deps.saveDialog.on('cancelled', () => this.settleSave(null)),
      deps.discardPrompt.on('confirmed', () => this.settleDiscard(true)),
      deps.discardPrompt.on('cancelled', () => this.settleDiscard(false)),
      deps.screens.on('screenChangeRefused', request => { void this.completeHeldScreenChange(request); }),
      deps.screens.on('screenChanged', screen => {
        if (screen.id !== deps.collectionScreenId) this.endForAnotherScreen();
      }),
    ];
  }

  enterFromGrid(clipId: string): void {
    const clip = this.deps.pipelineWorkingCopy.resolveClip(clipId);
    if (!clip || this.mode || !this.deps.zoomClips.openClip(clip)) return;
    this.begin(clip);
  }

  enterFromZoom(clip: Clip): void {
    this.begin(clip);
  }

  // Resolves true once the mode has ended and Zoom shows the clip again, false when the user keeps editing.
  async confirmLeave(): Promise<boolean> {
    const mode = this.mode;
    if (!mode) return true;
    if (!(await this.leave(mode))) return false;
    this.deps.zoomClips.openClip(mode.clip);
    return true;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.closeQuestions();
    const mode = this.mode;
    if (mode) await this.end(mode);
  }

  private begin(clip: Clip): void {
    const { zoom, openFolder, fullScreen, sessions, activeEdit } = this.deps;
    const folder = openFolder.currentFolderAccess;
    if (this.disposed || this.mode || !folder || fullScreen.isDocumentFullScreen()) return;
    const muted = zoom.isMuted();
    if (!zoom.showEditSurface()) return;
    const session = sessions.begin({ folder, filename: clip.name, hasSourceInfo: clip.sourceMovie !== null, muted });
    const mode: EditMode = {
      clip, folder, session, unsubscribe: () => undefined, shown: session.snapshot, notice: null, saving: null,
    };
    mode.unsubscribe = session.on('changed', snapshot => this.onSessionChanged(mode, snapshot));
    this.mode = mode;
    activeEdit.begin();
    this.render(mode);
  }

  private async perform(command: ZoomEditModeCommand): Promise<void> {
    const mode = this.mode;
    if (!mode) return;
    if (mode.saving) {
      if (command.kind === 'leave') this.cancelSaving(mode);
      else this.showNotice(mode, this.deps.text.stillSaving());
      return;
    }
    if (command.kind === 'leave') {
      await this.returnToZoom(mode);
      return;
    }
    if (command.kind === 'save') {
      await this.save(mode);
      return;
    }
    const answer = await this.sessionCommand(mode.session, command);
    if (this.mode === mode) this.showNotice(mode, this.noticeFor(answer));
  }

  private sessionCommand(session: IZoomEditSession, command: Exclude<ZoomEditModeCommand, { kind: 'leave' | 'save' }>): Promise<ZoomEditCommandAnswer> {
    switch (command.kind) {
      case 'toggle-playback': return session.togglePlayback();
      case 'step': return session.step(command.direction);
      case 'jump': return session.jump(command.seconds);
      case 'mark-start': return session.markStart();
      case 'mark-end': return session.markEnd();
      case 'jump-to-start': return session.jumpToStart();
      case 'jump-to-end': return session.jumpToEnd();
      case 'toggle-loop': return session.toggleLoop();
    }
  }

  private noticeFor(answer: ZoomEditCommandAnswer): string | null {
    if (answer.kind === 'refused') return this.deps.text.refusal(answer.refusal);
    if (answer.kind === 'failed') return this.deps.text.commandFailed();
    return null;
  }

  private async returnToZoom(mode: EditMode): Promise<void> {
    if (await this.leave(mode)) this.deps.zoomClips.openClip(mode.clip);
  }

  private async closeZoom(): Promise<void> {
    const mode = this.mode;
    if (mode && await this.leave(mode)) this.deps.zoomClips.close();
  }

  private async completeHeldScreenChange({ from, to }: IScreenChangeRequest): Promise<void> {
    const { policy, navigation } = this.deps;
    const mode = this.mode;
    if (!mode || policy.canLeave(from)) return;
    if (await this.leave(mode) && navigation.activeScreen.id === from.id) navigation.activate(to.id);
  }

  private endForAnotherScreen(): void {
    const mode = this.mode;
    if (!mode) return;
    this.closeQuestions();
    void this.end(mode);
  }

  private async leave(mode: EditMode): Promise<boolean> {
    if (this.hasStagedEdits(mode) && !(await this.askToDiscard(mode))) return false;
    void this.end(mode);
    return true;
  }

  // Disposing the session also detaches it from the shared player.
  private end(mode: EditMode): Promise<void> {
    const { activeEdit, zoom, folderRefresh } = this.deps;
    this.mode = null;
    mode.unsubscribe();
    activeEdit.end();
    if (mode.saving) this.cancelSaving(mode);
    zoom.hideEditSurface();
    void folderRefresh.afterZoomEditModeEnded();
    return mode.session.dispose();
  }

  private async save(mode: EditMode): Promise<void> {
    const { text, saves } = this.deps;
    if (!this.hasStagedEdits(mode)) {
      this.showNotice(mode, text.nothingToSave());
      return;
    }
    const outcome = await this.askSaveOutcome(mode);
    if (!outcome || this.mode !== mode || mode.saving) return;
    const saving: Saving = { waitingForMovie: false, progress: null, cancelled: false, stopWaiting: null };
    mode.saving = saving;
    mode.notice = null;
    if (!(await this.movieSettled(mode, saving))) {
      if (this.mode === mode) this.finishSaving(mode, text.saveCancelled());
      return;
    }
    try {
      const selection = mode.session.stagedSelection();
      if (!selection) throw new Error('Zoom edit mode has no staged range to save.');
      const saved = await saves.save({
        folder: mode.folder,
        filename: mode.clip.name,
        source: selection.source,
        sessionId: selection.sessionId,
        startFrame: selection.startFrame,
        endFrame: selection.endFrame,
        outcome,
      }, progress => {
        if (mode.saving !== saving) return;
        saving.progress = progress;
        mode.notice = null;
        this.render(mode);
      });
      this.reportSaved(mode.clip, saved);
      if (this.mode === mode) this.showSavedClip(mode);
    } catch (error) {
      if (this.mode !== mode) return;
      if (saving.cancelled) {
        this.finishSaving(mode, text.saveCancelled());
        return;
      }
      this.reportSaveFailure(mode.clip, error);
      this.finishSaving(mode, text.saveFailedHint());
    }
  }

  // A save waits while the source movie is still being found or prepared, so it can use the movie's frames.
  private async movieSettled(mode: EditMode, saving: Saving): Promise<boolean> {
    if (this.isPreparingMovie(mode.session.snapshot.extension)) {
      saving.waitingForMovie = true;
      this.render(mode);
      await new Promise<void>(resolve => { saving.stopWaiting = resolve; });
      saving.waitingForMovie = false;
      saving.stopWaiting = null;
    }
    this.render(mode);
    return !saving.cancelled && this.mode === mode;
  }

  private showSavedClip(mode: EditMode): void {
    void this.end(mode);
    this.deps.zoomClips.openClip(mode.clip);
  }

  private reportSaved(original: Clip, saved: SavedRefinedClip): void {
    this.deps.reporter.success(this.deps.text.saved(original.name, saved));
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

  private cancelSaving(mode: EditMode): void {
    const saving = mode.saving;
    if (!saving || saving.cancelled) return;
    saving.cancelled = true;
    if (saving.stopWaiting) {
      saving.stopWaiting();
      return;
    }
    void this.deps.saves.cancelSave().catch(error => this.deps.diagnostics.logRuntimeError('Cancelling a refined clip save failed.', error));
  }

  private finishSaving(mode: EditMode, notice: string): void {
    mode.saving = null;
    this.showNotice(mode, notice);
  }

  private askSaveOutcome(mode: EditMode): Promise<RefinedClipSaveOutcome | null> {
    this.settleSave(null);
    return new Promise(settle => {
      this.pendingSave = settle;
      this.deps.saveDialog.open(mode.clip.name);
    });
  }

  private askToDiscard(mode: EditMode): Promise<boolean> {
    this.settleDiscard(false);
    return new Promise(settle => {
      this.pendingDiscard = settle;
      this.deps.discardPrompt.open(this.changedEnds(mode));
    });
  }

  private changedEnds(mode: EditMode): UnlockedEndpointChange[] {
    const range = mode.session.snapshot.range;
    if (!range) return [];
    const changes: UnlockedEndpointChange[] = [];
    if (range.start !== 0) changes.push(Object.freeze({ endpoint: 'start', frameIndex: range.start }));
    if (range.end !== range.lastClipFrame) changes.push(Object.freeze({ endpoint: 'end', frameIndex: range.end }));
    return changes;
  }

  private settleSave(outcome: RefinedClipSaveOutcome | null): void {
    const pending = this.pendingSave;
    this.pendingSave = null;
    pending?.(outcome);
  }

  private settleDiscard(discard: boolean): void {
    const pending = this.pendingDiscard;
    this.pendingDiscard = null;
    pending?.(discard);
  }

  private closeQuestions(): void {
    if (this.pendingSave) this.deps.saveDialog.close();
    if (this.pendingDiscard) this.deps.discardPrompt.close();
    this.settleSave(null);
    this.settleDiscard(false);
  }

  private onSessionChanged(mode: EditMode, snapshot: IZoomEditModeSnapshot): void {
    if (this.mode !== mode) return;
    if (snapshot.picture !== mode.shown.picture || snapshot.extension !== mode.shown.extension) mode.notice = null;
    mode.shown = snapshot;
    if (mode.saving?.waitingForMovie && !this.isPreparingMovie(snapshot.extension)) mode.saving.stopWaiting?.();
    this.render(mode);
  }

  private hasStagedEdits(mode: EditMode): boolean {
    return mode.session.snapshot.range?.isChanged === true;
  }

  private isPreparingMovie(extension: ZoomEditExtension): boolean {
    return extension === 'finding-movie' || extension === 'preparing-window';
  }

  private showNotice(mode: EditMode, notice: string | null): void {
    mode.notice = notice;
    this.render(mode);
  }

  private render(mode: EditMode): void {
    const { zoom, text } = this.deps;
    zoom.showEditHint({ keys: mode.saving ? text.savingKeys() : text.keys(), status: this.statusOf(mode) });
  }

  private statusOf(mode: EditMode): string | null {
    const { text } = this.deps;
    if (mode.notice) return mode.notice;
    if (mode.saving) return mode.saving.waitingForMovie ? text.waitingForMovie() : text.saveProgress(mode.saving.progress);
    const { picture, extension } = mode.session.snapshot;
    return text.pictureStatus(picture) ?? text.extensionStatus(extension);
  }
}
