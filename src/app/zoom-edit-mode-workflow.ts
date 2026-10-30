import type { Clip } from '../domain/clip.js';
import type { RefineRangeEndChange } from '../domain/refine-range.js';
import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { AppSessionState } from './app-session-state.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import type { IRefinedClipSaveView, RefinedClipSaveEnd, RefinedClipSaveWorkflow, RefinedClipSaveStatus } from './refined-clip-save-workflow.js';
import type { IScreenChangeRequest } from './refine-leave-workflow.js';
import type { IScreenIdentity } from './refine-screen-leave-policy.js';
import type { IScreenNavigation } from './screen-navigation.js';
import type { ZoomEditModeCommand } from './zoom-edit-mode-keys.js';
import type { ZoomEditModeLeavePolicy } from './zoom-edit-mode-leave-policy.js';
import type {
  IZoomEditModeRequest,
  IZoomEditModeSnapshot,
  IZoomEditStagedSelection,
  ZoomEditCommandAnswer,
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

export interface IDiscardZoomEditPrompt extends IEventSource<{ confirmed: void; cancelled: void }> {
  open(changes: readonly RefineRangeEndChange[]): void;
  close(): void;
}

export interface IZoomEditScreenChanges extends IEventSource<{
  screenChangeRefused: IScreenChangeRequest;
  screenChanged: IScreenIdentity;
}> {}

type ZoomEditModeDependencies = Readonly<{
  sessions: IZoomEditSessions;
  saveWorkflow: Pick<RefinedClipSaveWorkflow, 'save' | 'stop'>;
  activeEdit: Pick<ActiveZoomEdit, 'begin' | 'end'>;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'resolveClip'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  zoom: IZoomEditSurface;
  zoomClips: IZoomClipView;
  keys: IEventSource<{ commandRequested: ZoomEditModeCommand }>;
  discardPrompt: IDiscardZoomEditPrompt;
  screens: IZoomEditScreenChanges;
  navigation: Pick<IScreenNavigation, 'activate' | 'activeScreen'>;
  policy: Pick<ZoomEditModeLeavePolicy, 'canLeave'>;
  collectionScreenId: string;
  fullScreen: { isDocumentFullScreen(): boolean };
  folderRefresh: { afterZoomEditModeEnded(): Promise<void> };
  text: ZoomEditModeText;
}>;

type EditMode = {
  readonly clip: Clip;
  readonly folder: FolderAccess;
  readonly session: IZoomEditSession;
  unsubscribe: () => void;
  shown: IZoomEditModeSnapshot;
  notice: string | null;
  saving: RefinedClipSaveStatus | null;
  lastCommand: Promise<unknown>;
};

export class ZoomEditModeWorkflow {
  private mode: EditMode | null = null;
  private pendingDiscard: ((discard: boolean) => void) | null = null;
  private disposed = false;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: ZoomEditModeDependencies) {
    this.unsubscribes = [
      deps.keys.on('commandRequested', command => { void this.perform(command); }),
      deps.zoom.on('closeRequested', () => { void this.closeZoom(); }),
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
    this.closeDiscardQuestion();
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
      clip, folder, session, unsubscribe: () => undefined, shown: session.snapshot, notice: null, saving: null, lastCommand: Promise.resolve(),
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
      if (command.kind === 'leave') this.deps.saveWorkflow.stop();
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
    const pending = this.sessionCommand(mode.session, command);
    mode.lastCommand = pending;
    const answer = await pending;
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
    this.closeDiscardQuestion();
    void this.end(mode);
  }

  private async leave(mode: EditMode): Promise<boolean> {
    if (this.hasStagedEdits(mode) && !(await this.askToDiscard(mode))) return false;
    void this.end(mode);
    return true;
  }

  private end(mode: EditMode): Promise<void> {
    const disposed = this.endWithoutFolderRefresh(mode);
    void this.deps.folderRefresh.afterZoomEditModeEnded();
    return disposed;
  }

  // Disposing the session also detaches it from the shared player.
  private endWithoutFolderRefresh(mode: EditMode): Promise<void> {
    const { activeEdit, zoom, saveWorkflow } = this.deps;
    this.mode = null;
    mode.unsubscribe();
    activeEdit.end();
    saveWorkflow.stop();
    zoom.hideEditSurface();
    return mode.session.dispose();
  }

  // Saving acts on the range the keys pressed before it leave, so it waits for them to finish.
  private async save(mode: EditMode): Promise<void> {
    await mode.lastCommand;
    if (this.mode !== mode || mode.saving) return;
    if (!this.hasStagedEdits(mode)) {
      this.showNotice(mode, this.deps.text.nothingToSave());
      return;
    }
    let savedClipShown = false;
    const view: IRefinedClipSaveView = {
      statusChanged: status => {
        if (this.mode !== mode) return;
        mode.saving = status;
        mode.notice = null;
        this.render(mode);
      },
      endEdit: () => {
        if (this.mode !== mode) return false;
        void this.endWithoutFolderRefresh(mode);
        savedClipShown = true;
        return true;
      },
    };
    const end = await this.deps.saveWorkflow.save(mode, view);
    // A refresh waits until the saved clip is in the views, so a re-listing cannot drop it from an unsaved collection view.
    if (end === 'saved' && savedClipShown) void this.deps.folderRefresh.afterZoomEditModeEnded();
    if (this.mode !== mode) return;
    mode.saving = null;
    this.showNotice(mode, this.noticeAfterSave(end));
  }

  private noticeAfterSave(end: RefinedClipSaveEnd): string | null {
    if (end === 'cancelled') return this.deps.text.saveCancelled();
    if (end === 'failed') return this.deps.text.saveFailedHint();
    return null;
  }

  private hasStagedEdits(mode: EditMode): boolean {
    return mode.session.snapshot.range?.isChanged === true;
  }

  private stagedChanges(mode: EditMode): readonly RefineRangeEndChange[] {
    return mode.session.snapshot.range?.changedEnds() ?? [];
  }

  private askToDiscard(mode: EditMode): Promise<boolean> {
    this.settleDiscard(false);
    return new Promise(settle => {
      this.pendingDiscard = settle;
      this.deps.discardPrompt.open(this.stagedChanges(mode));
    });
  }

  private settleDiscard(discard: boolean): void {
    const pending = this.pendingDiscard;
    this.pendingDiscard = null;
    pending?.(discard);
  }

  private closeDiscardQuestion(): void {
    if (this.pendingDiscard) this.deps.discardPrompt.close();
    this.settleDiscard(false);
  }

  private onSessionChanged(mode: EditMode, snapshot: IZoomEditModeSnapshot): void {
    if (this.mode !== mode) return;
    if (snapshot.picture !== mode.shown.picture || snapshot.extension !== mode.shown.extension) mode.notice = null;
    mode.shown = snapshot;
    this.render(mode);
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
    if (mode.saving) return mode.saving.kind === 'waiting-for-movie' ? text.waitingForMovie() : text.saveProgress(mode.saving.progress);
    const { picture, extension } = mode.session.snapshot;
    return text.pictureStatus(picture) ?? text.extensionStatus(extension);
  }
}
