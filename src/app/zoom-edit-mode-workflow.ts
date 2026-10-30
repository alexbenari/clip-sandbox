import type { Clip } from '../domain/clip.js';
import type { ZoomEditComposition } from '../domain/zoom-edit-composition.js';
import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { AppSessionState } from './app-session-state.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { StepDirection } from './held-step-repeat.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import type { IEditedClipSaveView, EditedClipSaveEnd, EditedClipSaveWorkflow, EditedClipSaveStatus } from './edited-clip-save-workflow.js';
import type { IScreenChangeRequest } from './refine-leave-workflow.js';
import type { IScreenIdentity } from './refine-screen-leave-policy.js';
import type { IScreenNavigation } from './screen-navigation.js';
import type { ZoomEditStagedChange } from './staged-edit.js';
import type { ZoomEditModeCommand } from './zoom-edit-mode-keys.js';
import type { ZoomEditModeLeavePolicy } from './zoom-edit-mode-leave-policy.js';
import type {
  IZoomEditModeRequest,
  IZoomEditModeSnapshot,
  IZoomEditStagedSelection,
  ZoomEditCommandAnswer,
  ZoomEditJumpSeconds,
  ZoomEditRefusal,
} from './zoom-edit-mode-session.js';
import type { ZoomEditModeText } from './zoom-edit-mode-text.js';

export interface IZoomEditSession extends IEventSource<{ changed: IZoomEditModeSnapshot }> {
  readonly snapshot: IZoomEditModeSnapshot;
  stagedSelection(): IZoomEditStagedSelection | null;
  saveRefusal(): ZoomEditRefusal | null;
  stagedEdits(): ZoomEditComposition;
  stagedChanges(): readonly ZoomEditStagedChange[];
  togglePlayback(): Promise<ZoomEditCommandAnswer>;
  pressStep(direction: StepDirection): Promise<ZoomEditCommandAnswer>;
  releaseStep(direction: StepDirection): void;
  jump(seconds: ZoomEditJumpSeconds): Promise<ZoomEditCommandAnswer>;
  markStart(): Promise<ZoomEditCommandAnswer>;
  markEnd(): Promise<ZoomEditCommandAnswer>;
  jumpToStart(): Promise<ZoomEditCommandAnswer>;
  jumpToEnd(): Promise<ZoomEditCommandAnswer>;
  toggleLoop(): Promise<ZoomEditCommandAnswer>;
  toggleLoopify(): Promise<ZoomEditCommandAnswer>;
  pause(): Promise<void>;
  dispose(): Promise<void>;
}

export interface IZoomEditSessions {
  begin(request: IZoomEditModeRequest): IZoomEditSession;
}

export type ZoomEditHint = Readonly<{ keys: string; status: string | null }>;

export type ZoomEditEntry = 'refine' | 'loopify';

export interface IZoomEditSurface extends IEventSource<{ closeRequested: void }> {
  isMuted(): boolean;
  showEditSurface(): boolean;
  showEditHint(hint: ZoomEditHint): void;
  showEditPreview(mediaSource: string): void;
  hideEditPreview(): void;
  hideEditSurface(): void;
}

export interface IZoomClipView {
  openClip(clip: Clip): boolean;
  close(): void;
}

export interface IDiscardZoomEditPrompt extends IEventSource<{ confirmed: void; cancelled: void }> {
  open(changes: readonly ZoomEditStagedChange[]): void;
  close(): void;
}

export interface IZoomEditScreenChanges extends IEventSource<{
  screenChangeRefused: IScreenChangeRequest;
  screenChanged: IScreenIdentity;
}> {}

type ZoomEditModeDependencies = Readonly<{
  sessions: IZoomEditSessions;
  saveWorkflow: Pick<EditedClipSaveWorkflow, 'save' | 'stop'>;
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
  saving: EditedClipSaveStatus | null;
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
    this.begin(clip, 'refine');
  }

  enterFromZoom(clip: Clip, entry: ZoomEditEntry): void {
    this.begin(clip, entry);
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

  private begin(clip: Clip, entry: ZoomEditEntry): void {
    const { zoom, openFolder, fullScreen, sessions, activeEdit } = this.deps;
    const folder = openFolder.currentFolderAccess;
    if (this.disposed || this.mode || !folder || fullScreen.isDocumentFullScreen()) return;
    const muted = zoom.isMuted();
    if (!zoom.showEditSurface()) return;
    const session = sessions.begin({
      folder, filename: clip.name, hasSourceInfo: clip.sourceMovie !== null, muted, loopify: entry === 'loopify',
    });
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
    if (command.kind === 'release-step') {
      mode.session.releaseStep(command.direction);
      return;
    }
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
    // A held step stages nothing, and saving must not wait for the key to be released.
    if (command.kind !== 'press-step') mode.lastCommand = pending;
    const answer = await pending;
    if (this.mode === mode) this.showNotice(mode, this.noticeFor(answer));
  }

  private sessionCommand(session: IZoomEditSession,
    command: Exclude<ZoomEditModeCommand, { kind: 'leave' | 'save' | 'release-step' }>): Promise<ZoomEditCommandAnswer> {
    switch (command.kind) {
      case 'toggle-playback': return session.togglePlayback();
      case 'press-step': return session.pressStep(command.direction);
      case 'jump': return session.jump(command.seconds);
      case 'mark-start': return session.markStart();
      case 'mark-end': return session.markEnd();
      case 'jump-to-start': return session.jumpToStart();
      case 'jump-to-end': return session.jumpToEnd();
      case 'toggle-loop': return session.toggleLoop();
      case 'toggle-loopify': return session.toggleLoopify();
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

  // A question about the staged edits is asked over a still picture; the clip stays paused whatever the answer.
  private async leave(mode: EditMode): Promise<boolean> {
    if (this.hasStagedEdits(mode)) {
      await mode.session.pause();
      if (this.mode !== mode || !(await this.askToDiscard(mode))) return false;
    }
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
    const refusal = mode.session.saveRefusal();
    if (refusal) {
      this.showNotice(mode, this.deps.text.refusal(refusal));
      return;
    }
    await mode.session.pause();
    if (this.mode !== mode) return;
    let savedClipShown = false;
    const view: IEditedClipSaveView = {
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

  private noticeAfterSave(end: EditedClipSaveEnd): string | null {
    if (end === 'cancelled') return this.deps.text.saveCancelled();
    if (end === 'failed') return this.deps.text.saveFailedHint();
    return null;
  }

  private hasStagedEdits(mode: EditMode): boolean {
    return !mode.session.stagedEdits().isEmpty;
  }

  private askToDiscard(mode: EditMode): Promise<boolean> {
    this.settleDiscard(false);
    return new Promise(settle => {
      this.pendingDiscard = settle;
      this.deps.discardPrompt.open(mode.session.stagedChanges());
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
    if (snapshot.picture !== mode.shown.picture || snapshot.extension !== mode.shown.extension
      || snapshot.preview.kind !== mode.shown.preview.kind) mode.notice = null;
    mode.shown = snapshot;
    this.render(mode);
  }

  private showNotice(mode: EditMode, notice: string | null): void {
    mode.notice = notice;
    this.render(mode);
  }

  private render(mode: EditMode): void {
    const { zoom, text } = this.deps;
    const { preview } = mode.session.snapshot;
    if (preview.kind === 'playing') zoom.showEditPreview(preview.mediaSource);
    else zoom.hideEditPreview();
    zoom.showEditHint({ keys: mode.saving ? text.savingKeys() : text.keys(), status: this.statusOf(mode) });
  }

  private statusOf(mode: EditMode): string | null {
    const { text } = this.deps;
    if (mode.notice) return mode.notice;
    if (mode.saving) return mode.saving.kind === 'waiting-for-movie' ? text.waitingForMovie() : text.saveProgress(mode.saving.progress);
    const { picture, extension, extensionPending, preview } = mode.session.snapshot;
    return text.previewStatus(preview) ?? text.pictureStatus(picture)
      ?? (extensionPending ? text.extensionStatus(extension) : null)
      ?? text.stagedEdits(mode.session.stagedEdits()) ?? text.extensionStatus(extension);
  }
}
