import { describe, expect, it, vi } from 'vitest';

import { ActiveZoomEdit } from '../../src/app/active-zoom-edit.js';
import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import type { UnlockedEndpointChange } from '../../src/app/range-refinement-draft.js';
import type { IRefinedClipSaveProgress, IRefinedClipSaveRequest, RefinedClipSaveOutcome, SavedRefinedClip } from '../../src/app/refined-clip-save-service.js';
import type { ZoomEditModeCommand } from '../../src/app/zoom-edit-mode-keys.js';
import { ZoomEditModeLeavePolicy } from '../../src/app/zoom-edit-mode-leave-policy.js';
import type {
  IZoomEditModeRequest,
  IZoomEditModeSnapshot,
  ZoomEditCommandAnswer,
  ZoomEditExtension,
  ZoomEditRefusal,
} from '../../src/app/zoom-edit-mode-session.js';
import { ZoomEditModeText } from '../../src/app/zoom-edit-mode-text.js';
import { ZoomEditModeWorkflow, type ZoomEditHint } from '../../src/app/zoom-edit-mode-workflow.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { RefineRange } from '../../src/domain/refine-range.js';
import { SourceMovie } from '../../src/domain/source-movie.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { clipSource } from '../support/clip-source-fixtures.js';
import { deferred, type Deferred } from '../support/deferred.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

const DONE: ZoomEditCommandAnswer = { kind: 'done' };

// Lets every queued promise callback run, since a dropped command leaves nothing to wait for.
const settled = () => new Promise(resolve => setTimeout(resolve, 0));
const KEYS = 'Q start · W end · A/S jump · Z loop · X save · Esc leave';
const CLIP_FRAMES = 48;

class FakeEditSession extends EventSource<{ changed: IZoomEditModeSnapshot }> {
  snapshot: IZoomEditModeSnapshot = { picture: 'preparing', extension: 'none', range: null };
  readonly answers: ZoomEditCommandAnswer[] = [];
  readonly dispose = vi.fn(async () => undefined);
  private readonly answer = () => Promise.resolve(this.answers.shift() ?? DONE);
  readonly togglePlayback = vi.fn(this.answer);
  readonly step = vi.fn((_direction: -1 | 1) => this.answer());
  readonly jump = vi.fn((_seconds: number) => this.answer());
  readonly markStart = vi.fn(this.answer);
  readonly markEnd = vi.fn(this.answer);
  readonly jumpToStart = vi.fn(this.answer);
  readonly jumpToEnd = vi.fn(this.answer);
  readonly toggleLoop = vi.fn(this.answer);

  stagedSelection() {
    const range = this.snapshot.range;
    if (!range) return null;
    return { source: { kind: 'clip' as const }, sessionId: FrameReviewOpaqueId.sessionId('session_clip_0001'), startFrame: range.start, endFrame: range.end };
  }

  change(snapshot: Partial<IZoomEditModeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...snapshot };
    this.emit('changed', this.snapshot);
  }

  becomeReady(): void {
    this.change({ picture: 'ready', range: RefineRange.ofClip(CLIP_FRAMES) });
  }

  stageStart(frame: number): void {
    const change = this.snapshot.range!.withStart(frame);
    if (change.kind !== 'changed') throw new Error('The test staged an unreachable start.');
    this.change({ range: change.range });
  }
}

class FakeZoomSurface extends EventSource<{ closeRequested: void }> {
  muted = false;
  hint: ZoomEditHint | null = null;
  editing = false;
  isMuted() { return this.muted; }
  showEditSurface() { this.editing = true; return true; }
  showEditHint(hint: ZoomEditHint) { this.hint = hint; }
  hideEditSurface() { this.editing = false; this.hint = null; }
}

class FakeDialog<TEvents> extends EventSource<TEvents> {
  readonly open = vi.fn();
  readonly close = vi.fn();
}

function zoomEditMode({ fullScreen = false } = {}) {
  const pipeline = new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4'), clipSource('bravo.mp4')] });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const [alpha, bravo] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const openFolder = new AppSessionState();
  const folder = { folderPath: 'C:/clips' };
  openFolder.setCurrentFolderAccess(folder);
  const session = new FakeEditSession();
  const sessions = { begin: vi.fn((_request: IZoomEditModeRequest) => session) };
  const saveAnswers: Deferred<SavedRefinedClip>[] = [];
  const saveProgress: ((progress: IRefinedClipSaveProgress) => void)[] = [];
  const saves = {
    save: vi.fn((_request: IRefinedClipSaveRequest, onProgress?: (progress: IRefinedClipSaveProgress) => void) => {
      const answer = deferred<SavedRefinedClip>();
      saveAnswers.push(answer);
      if (onProgress) saveProgress.push(onProgress);
      return answer.promise;
    }),
    cancelSave: vi.fn(async () => {
      saveAnswers.at(-1)?.reject(new Error('The save was cancelled.'));
    }),
  };
  const activeEdit = new ActiveZoomEdit();
  const zoom = new FakeZoomSurface();
  const zoomClips = { openClip: vi.fn(() => true), close: vi.fn() };
  const keys = new EventSource<{ commandRequested: ZoomEditModeCommand }>();
  const saveDialog = new FakeDialog<{ confirmed: RefinedClipSaveOutcome; cancelled: void }>();
  const discardPrompt = new FakeDialog<{ confirmed: void; cancelled: void }>();
  const screens = new EventSource<{ screenChangeRefused: { from: { id: string }; to: { id: string } }; screenChanged: { id: string } }>();
  const navigation = { activeScreen: { id: 'collection' }, activate: vi.fn((id: string) => { navigation.activeScreen = { id }; }) };
  const folderRefresh = { afterZoomEditModeEnded: vi.fn(async () => undefined) };
  const activityLog = recordedActivityLog();
  const workflow = new ZoomEditModeWorkflow({
    sessions,
    saves,
    activeEdit,
    pipelineWorkingCopy,
    openFolder,
    zoom,
    zoomClips,
    keys,
    saveDialog,
    discardPrompt,
    screens,
    navigation,
    policy: new ZoomEditModeLeavePolicy({ activeEdit, collectionScreenId: 'collection' }),
    collectionScreenId: 'collection',
    fullScreen: { isDocumentFullScreen: () => fullScreen },
    folderRefresh,
    reporter: new ActivityReporter(activityLog),
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
    text: new ZoomEditModeText(),
  });
  const press = async (command: ZoomEditModeCommand) => {
    keys.emit('commandRequested', command);
    await settled();
  };
  return {
    workflow, session, sessions, saves, saveAnswers, saveProgress, activeEdit, zoom, zoomClips, saveDialog,
    discardPrompt, screens, navigation, folderRefresh, entries: activityLog.entries, alpha, bravo, folder, press,
  };
}

async function editingReadyClip() {
  const context = zoomEditMode();
  context.workflow.enterFromGrid(context.alpha.id);
  context.session.becomeReady();
  return context;
}

async function withStagedStart() {
  const context = await editingReadyClip();
  context.session.stageStart(6);
  return context;
}

const savedAsKeepBoth: SavedRefinedClip = {
  outcome: 'kept-both',
  filename: 'alpha-refined.mp4',
  entry: { name: 'alpha-refined.mp4', type: 'video/mp4', size: 1024, lastModifiedMs: 1 },
};

describe('ZoomEditModeWorkflow', () => {
  describe('entering', () => {
    it('from the grid opens Zoom on the clip and starts editing it with the sound Zoom had', () => {
      const { workflow, sessions, zoomClips, zoom, alpha, folder } = zoomEditMode();
      zoom.muted = true;
      alpha.recordSourceMovie(SourceMovie.fromFileName('Feature.mkv'));

      workflow.enterFromGrid(alpha.id);

      expect(zoomClips.openClip).toHaveBeenCalledWith(alpha);
      expect(zoom.editing).toBe(true);
      expect(sessions.begin).toHaveBeenCalledWith({ folder, filename: 'alpha.mp4', hasSourceInfo: true, muted: true });
    });

    it('from Zoom edits the zoomed clip where Zoom already shows it', () => {
      const { workflow, sessions, zoomClips, bravo } = zoomEditMode();

      workflow.enterFromZoom(bravo);

      expect(zoomClips.openClip).not.toHaveBeenCalled();
      expect(sessions.begin.mock.calls[0][0].filename).toBe('bravo.mp4');
    });

    it('opens a clip without source info for trimming only', () => {
      const { workflow, sessions, bravo } = zoomEditMode();

      workflow.enterFromZoom(bravo);

      expect(sessions.begin.mock.calls[0][0].hasSourceInfo).toBe(false);
    });

    it('shows the keys and that the clip is being prepared', () => {
      const { workflow, zoom, alpha } = zoomEditMode();

      workflow.enterFromGrid(alpha.id);

      expect(zoom.hint).toEqual({ keys: KEYS, status: 'Preparing the clip…' });
    });

    it('is not available in Collection full screen', () => {
      const { workflow, sessions, zoom, activeEdit, alpha } = zoomEditMode({ fullScreen: true });

      workflow.enterFromZoom(alpha);

      expect(sessions.begin).not.toHaveBeenCalled();
      expect(zoom.editing).toBe(false);
      expect(activeEdit.isActive).toBe(false);
    });

    it('does nothing when Zoom cannot show the clip', () => {
      const { workflow, sessions, zoomClips, alpha } = zoomEditMode();
      zoomClips.openClip.mockReturnValue(false);

      workflow.enterFromGrid(alpha.id);

      expect(sessions.begin).not.toHaveBeenCalled();
    });
  });

  describe('keys', () => {
    it.each<[string, ZoomEditModeCommand, (session: FakeEditSession) => unknown]>([
      ['Space', { kind: 'toggle-playback' }, session => session.togglePlayback.mock.calls],
      ['Left', { kind: 'step', direction: -1 }, session => session.step.mock.calls],
      ['Right', { kind: 'step', direction: 1 }, session => session.step.mock.calls],
      ['5', { kind: 'jump', seconds: 10 }, session => session.jump.mock.calls],
      ['Q', { kind: 'mark-start' }, session => session.markStart.mock.calls],
      ['W', { kind: 'mark-end' }, session => session.markEnd.mock.calls],
      ['A', { kind: 'jump-to-start' }, session => session.jumpToStart.mock.calls],
      ['S', { kind: 'jump-to-end' }, session => session.jumpToEnd.mock.calls],
      ['Z', { kind: 'toggle-loop' }, session => session.toggleLoop.mock.calls],
    ])('%s runs its session command', async (_key, command, calls) => {
      const { session, press } = await editingReadyClip();

      await press(command);

      const expectedArguments = command.kind === 'step' ? [command.direction] : command.kind === 'jump' ? [command.seconds] : [];
      expect(calls(session)).toEqual([expectedArguments]);
    });

    it.each<[string, ZoomEditRefusal, string]>([
      ['the clip is still preparing', { reason: 'clip-preparing' }, 'The clip is still being prepared. Try again in a moment.'],
      ['the clip failed to open', { reason: 'source-failed' }, 'This clip could not be opened for editing. Press Esc to leave.'],
      ['a start after the end', { reason: 'start-after-end' },
        'This frame is after the end, so it cannot be the start. Go back, or set a later end with W first.'],
      ['an end before the start', { reason: 'end-before-start' },
        'This frame is before the start, so it cannot be the end. Go forward, or set an earlier start with Q first.'],
      ['a frame beyond the extension limit', { reason: 'beyond-extension' }, 'Extending stops one minute past the clip’s original start and end.'],
      ['a one-frame loop', { reason: 'loop-needs-two-frames' }, 'The start and the end are the same frame. Set a longer range to loop it.'],
      ['an ended session', { reason: 'ended' }, 'Zoom edit mode has ended.'],
      ['extending a clip without source info', { reason: 'extension-unavailable', extension: 'none' },
        'This clip has no source movie info, so it can be trimmed but not extended.'],
      ['extending while the movie is being found', { reason: 'extension-unavailable', extension: 'finding-movie' },
        'Extending is not available yet: the source movie is still being found.'],
      ['extending while the movie is being prepared', { reason: 'extension-unavailable', extension: 'preparing-window' },
        'Extending is not available yet: the movie around this clip is still being prepared.'],
      ['extending after the movie lookup was cancelled', { reason: 'extension-unavailable', extension: 'cancelled' },
        'No source movie was chosen, so this clip can be trimmed but not extended.'],
      ['extending when the clip is not in its movie', { reason: 'extension-unavailable', extension: 'not-found' },
        'This clip was not found in its source movie, so it can be trimmed but not extended.'],
      ['extending after the movie failed to prepare', { reason: 'extension-unavailable', extension: 'failed' },
        'The source movie could not be prepared, so this clip can be trimmed but not extended.'],
    ])('a key refused for %s says why in the hint line', async (_case, refusal, sentence) => {
      const { session, zoom, press } = await editingReadyClip();
      session.answers.push({ kind: 'refused', refusal });

      await press({ kind: 'step', direction: 1 });

      expect(zoom.hint).toEqual({ keys: KEYS, status: sentence });
    });

    it('a key that failed asks to try it again', async () => {
      const { session, zoom, press } = await editingReadyClip();
      session.answers.push({ kind: 'failed' });

      await press({ kind: 'mark-start' });

      expect(zoom.hint?.status).toBe('That key could not act. Try it again.');
    });

    it('a key that acts clears the reason the previous key gave', async () => {
      const { session, zoom, press } = await editingReadyClip();
      session.answers.push({ kind: 'refused', refusal: { reason: 'beyond-extension' } });
      await press({ kind: 'step', direction: 1 });

      await press({ kind: 'step', direction: -1 });

      expect(zoom.hint).toEqual({ keys: KEYS, status: null });
    });
  });

  describe('the source movie in the hint line', () => {
    it.each<[ZoomEditExtension, string | null]>([
      ['finding-movie', 'Finding the source movie…'],
      ['preparing-window', 'Preparing the movie around this clip…'],
      ['ready', null],
      ['none', null],
      ['cancelled', 'No source movie was chosen, so this clip can be trimmed but not extended.'],
      ['not-found', 'This clip was not found in its source movie, so it can be trimmed but not extended.'],
      ['failed', 'The source movie could not be prepared, so this clip can be trimmed but not extended.'],
    ])('reads %s as its status once the clip is ready', async (extension, status) => {
      const { session, zoom } = await editingReadyClip();

      session.change({ extension });

      expect(zoom.hint).toEqual({ keys: KEYS, status });
    });

    it('drops a reason about extending once the movie is ready', async () => {
      const { session, zoom, press } = await editingReadyClip();
      session.change({ extension: 'preparing-window' });
      session.answers.push({ kind: 'refused', refusal: { reason: 'extension-unavailable', extension: 'preparing-window' } });
      await press({ kind: 'step', direction: -1 });

      session.change({ extension: 'ready' });

      expect(zoom.hint?.status).toBeNull();
    });
  });

  describe('saving', () => {
    it('with nothing staged says so instead of asking', async () => {
      const { saveDialog, zoom, press } = await editingReadyClip();

      await press({ kind: 'save' });

      expect(saveDialog.open).not.toHaveBeenCalled();
      expect(zoom.hint?.status).toBe('Nothing to save yet. Set a new start with Q or a new end with W.');
    });

    it('asks Keep both or Replace for the clip, and saves nothing when cancelled', async () => {
      const { saveDialog, saves, activeEdit, press } = await withStagedStart();

      await press({ kind: 'save' });
      expect(saveDialog.open).toHaveBeenCalledWith('alpha.mp4');
      saveDialog.emit('cancelled');
      await press({ kind: 'mark-end' });

      expect(saves.save).not.toHaveBeenCalled();
      expect(activeEdit.isActive).toBe(true);
    });

    it('saves the staged range with the chosen outcome and shows its progress', async () => {
      const { saveDialog, saves, saveProgress, zoom, folder, press } = await withStagedStart();
      await press({ kind: 'save' });

      saveDialog.emit('confirmed', 'replace');
      await vi.waitFor(() => expect(saves.save).toHaveBeenCalledOnce());
      saveProgress[0]({ stage: 'encoding-video', encodedFrames: 12, totalFrames: 42 });

      expect(saves.save.mock.calls[0][0]).toEqual({
        folder, filename: 'alpha.mp4', source: { kind: 'clip' }, sessionId: 'session_clip_0001', startFrame: 6, endFrame: 47, outcome: 'replace',
      });
      expect(zoom.hint).toEqual({ keys: 'Esc cancel saving', status: 'Saving: encoded 12 of 42 frames…' });
    });

    it('after saving ends the mode, shows the clip in Zoom and reports the saved clip', async () => {
      const { saveDialog, saveAnswers, session, zoom, zoomClips, activeEdit, entries, alpha, press } = await withStagedStart();
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(saveAnswers).toHaveLength(1));

      zoomClips.openClip.mockClear();
      saveAnswers[0].resolve(savedAsKeepBoth);

      await vi.waitFor(() => expect(activeEdit.isActive).toBe(false));
      expect(zoom.editing).toBe(false);
      expect(session.dispose).toHaveBeenCalledOnce();
      expect(zoomClips.openClip.mock.calls).toEqual([[alpha]]);
      expect(entries.at(-1)).toMatchObject({ kind: 'success', message: 'Saved the refined clip as alpha-refined.mp4.' });
    });

    it('that fails reports to Activity and keeps editing with the staged range', async () => {
      const { saveDialog, saveAnswers, session, zoom, activeEdit, entries, press } = await withStagedStart();
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(saveAnswers).toHaveLength(1));

      saveAnswers[0].reject(new Error('The disk is full.'));

      await vi.waitFor(() => expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Could not save the refined alpha.mp4.' }));
      expect(activeEdit.isActive).toBe(true);
      expect(session.snapshot.range?.start).toBe(6);
      expect(zoom.hint).toEqual({ keys: KEYS, status: 'The clip could not be saved. Your new start and end are kept; press X to try again.' });
    });

    it('is cancelled by Escape, keeping the staged range', async () => {
      const { saveDialog, saves, saveAnswers, zoom, activeEdit, press } = await withStagedStart();
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(saveAnswers).toHaveLength(1));

      await press({ kind: 'leave' });

      expect(saves.cancelSave).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(zoom.hint?.status).toBe('Saving was cancelled. Your new start and end are kept.'));
      expect(activeEdit.isActive).toBe(true);
    });

    it('waits for the movie around the clip while it is prepared, then saves', async () => {
      const { saveDialog, saves, session, zoom, press } = await withStagedStart();
      session.change({ extension: 'preparing-window' });
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(zoom.hint?.status).toBe('Saving waits for the movie around this clip…'));
      expect(saves.save).not.toHaveBeenCalled();

      session.change({ extension: 'ready' });

      await vi.waitFor(() => expect(saves.save).toHaveBeenCalledOnce());
    });

    it('stops waiting for the movie when Escape is pressed, saving nothing', async () => {
      const { saveDialog, saves, session, zoom, activeEdit, press } = await withStagedStart();
      session.change({ extension: 'finding-movie' });
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(zoom.hint?.status).toBe('Saving waits for the movie around this clip…'));

      await press({ kind: 'leave' });
      session.change({ extension: 'ready' });
      await press({ kind: 'mark-end' });

      expect(saves.save).not.toHaveBeenCalled();
      expect(activeEdit.isActive).toBe(true);
    });

    it('says a save is running when another key is pressed meanwhile', async () => {
      const { saveDialog, saveAnswers, session, zoom, press } = await withStagedStart();
      await press({ kind: 'save' });
      saveDialog.emit('confirmed', 'keep-both');
      await vi.waitFor(() => expect(saveAnswers).toHaveLength(1));

      await press({ kind: 'mark-end' });

      expect(session.markEnd).not.toHaveBeenCalled();
      expect(zoom.hint?.status).toBe('Saving is in progress. Press Esc to cancel it.');
    });
  });

  describe('leaving', () => {
    it('by Escape without staged edits returns to Zoom on the same clip', async () => {
      const { session, zoom, zoomClips, activeEdit, discardPrompt, folderRefresh, alpha, press } = await editingReadyClip();

      await press({ kind: 'leave' });

      expect(discardPrompt.open).not.toHaveBeenCalled();
      expect(activeEdit.isActive).toBe(false);
      expect(zoom.editing).toBe(false);
      expect(session.dispose).toHaveBeenCalledOnce();
      expect(zoomClips.openClip).toHaveBeenLastCalledWith(alpha);
      expect(zoomClips.close).not.toHaveBeenCalled();
      expect(folderRefresh.afterZoomEditModeEnded).toHaveBeenCalledOnce();
    });

    it('by Escape with a staged edit asks first, naming the changed end', async () => {
      const { discardPrompt, activeEdit, press } = await withStagedStart();

      await press({ kind: 'leave' });

      expect(discardPrompt.open).toHaveBeenCalledWith([{ endpoint: 'start', frameIndex: 6 }] satisfies UnlockedEndpointChange[]);
      expect(activeEdit.isActive).toBe(true);
    });

    it('keeps the staged edit and the shown clip when the user keeps editing', async () => {
      const { discardPrompt, session, zoom, activeEdit, press } = await withStagedStart();
      await press({ kind: 'leave' });

      discardPrompt.emit('cancelled');
      await press({ kind: 'mark-end' });

      expect(activeEdit.isActive).toBe(true);
      expect(zoom.editing).toBe(true);
      expect(session.dispose).not.toHaveBeenCalled();
      expect(session.snapshot.range?.start).toBe(6);
      expect(session.markEnd).toHaveBeenCalledOnce();
    });

    it('returns to Zoom on the same clip after Discard', async () => {
      const { discardPrompt, zoomClips, activeEdit, alpha, press } = await withStagedStart();
      await press({ kind: 'leave' });

      discardPrompt.emit('confirmed');

      await vi.waitFor(() => expect(activeEdit.isActive).toBe(false));
      expect(zoomClips.openClip).toHaveBeenLastCalledWith(alpha);
    });

    it('by a backdrop click closes Zoom, asking first with a staged edit', async () => {
      const { zoom, zoomClips, discardPrompt, activeEdit } = await withStagedStart();

      zoom.emit('closeRequested');
      expect(discardPrompt.open).toHaveBeenCalledOnce();
      expect(zoomClips.close).not.toHaveBeenCalled();
      discardPrompt.emit('confirmed');

      await vi.waitFor(() => expect(zoomClips.close).toHaveBeenCalledOnce());
      expect(activeEdit.isActive).toBe(false);
    });

    it('by a backdrop click without staged edits closes Zoom at once', async () => {
      const { zoom, zoomClips, discardPrompt } = await editingReadyClip();

      zoom.emit('closeRequested');

      await vi.waitFor(() => expect(zoomClips.close).toHaveBeenCalledOnce());
      expect(discardPrompt.open).not.toHaveBeenCalled();
    });

    it('completes a held screen change after Discard', async () => {
      const { screens, discardPrompt, navigation, activeEdit } = await withStagedStart();

      screens.emit('screenChangeRefused', { from: { id: 'collection' }, to: { id: 'settings' } });
      expect(discardPrompt.open).toHaveBeenCalledOnce();
      discardPrompt.emit('confirmed');

      await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledWith('settings'));
      expect(activeEdit.isActive).toBe(false);
    });

    it('completes a held screen change at once when nothing is staged, ending the mode first', async () => {
      const { screens, discardPrompt, navigation, session } = await editingReadyClip();
      let disposedBeforeChange = false;
      navigation.activate.mockImplementation(id => { disposedBeforeChange = session.dispose.mock.calls.length > 0; navigation.activeScreen = { id }; });

      screens.emit('screenChangeRefused', { from: { id: 'collection' }, to: { id: 'gif-extraction' } });

      await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledWith('gif-extraction'));
      expect(disposedBeforeChange).toBe(true);
      expect(discardPrompt.open).not.toHaveBeenCalled();
    });

    it('stays on the screen and in the mode when the user keeps editing instead of changing screen', async () => {
      const { screens, discardPrompt, navigation, activeEdit } = await withStagedStart();

      screens.emit('screenChangeRefused', { from: { id: 'collection' }, to: { id: 'settings' } });
      discardPrompt.emit('cancelled');
      await settled();

      expect(navigation.activate).not.toHaveBeenCalled();
      expect(activeEdit.isActive).toBe(true);
    });

    it('ends when another screen becomes active', async () => {
      const { screens, session, activeEdit } = await editingReadyClip();

      screens.emit('screenChanged', { id: 'gif-extraction' });

      expect(activeEdit.isActive).toBe(false);
      expect(session.dispose).toHaveBeenCalledOnce();
    });

    it('answers a folder action that the user kept editing, staying in the mode', async () => {
      const { workflow, discardPrompt, activeEdit } = await withStagedStart();

      const left = workflow.confirmLeave();
      discardPrompt.emit('cancelled');

      expect(await left).toBe(false);
      expect(activeEdit.isActive).toBe(true);
    });

    it('answers a folder action that the user discarded for, once the mode has ended', async () => {
      const { workflow, discardPrompt, activeEdit } = await withStagedStart();

      const left = workflow.confirmLeave();
      discardPrompt.emit('confirmed');

      expect(await left).toBe(true);
      expect(activeEdit.isActive).toBe(false);
    });

    it('ends the mode when disposed', async () => {
      const { workflow, session, activeEdit } = await editingReadyClip();

      await workflow.dispose();

      expect(session.dispose).toHaveBeenCalledOnce();
      expect(activeEdit.isActive).toBe(false);
    });

    it('enters no mode once disposed', async () => {
      const { workflow, sessions, activeEdit, alpha } = zoomEditMode();
      await workflow.dispose();

      workflow.enterFromZoom(alpha);

      expect(sessions.begin).not.toHaveBeenCalled();
      expect(activeEdit.isActive).toBe(false);
    });
  });
});
