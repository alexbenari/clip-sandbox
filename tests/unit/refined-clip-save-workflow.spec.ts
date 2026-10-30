import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import type { ClipFileReplacementResult } from '../../src/app/clip-file-replacement.js';
import { EventSource } from '../../src/app/event-source.js';
import { RefinedClipSaveWorkflow, type IRefinedClipSaveView } from '../../src/app/refined-clip-save-workflow.js';
import type { ISavedClipEntry, RefinedClipSaveOutcome, SavedRefinedClip } from '../../src/app/refined-clip-save-service.js';
import type { IZoomEditModeSnapshot } from '../../src/app/zoom-edit-mode-session.js';
import { ZoomEditModeText } from '../../src/app/zoom-edit-mode-text.js';
import type { Clip } from '../../src/domain/clip.js';
import type { ClipSource } from '../../src/domain/clip-source.js';
import { RefineRange } from '../../src/domain/refine-range.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { clipSource, testClip } from '../support/clip-source-fixtures.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

const entry = (name: string): ISavedClipEntry => ({
  name, path: `C:/clips/${name}`, mediaSource: `file:///C:/clips/${name}?modified=7`, type: 'video/mp4', size: 1024, lastModifiedMs: 7,
});

class FakeSaveDialog extends EventSource<{ confirmed: RefinedClipSaveOutcome; cancelled: void }> {
  readonly open = vi.fn();
  readonly close = vi.fn();
}

class FakeSession extends EventSource<{ changed: IZoomEditModeSnapshot }> {
  snapshot: IZoomEditModeSnapshot = { picture: 'ready', extension: 'none', extensionPending: false, range: RefineRange.ofClip(48) };
  stagedSelection() {
    return { source: { kind: 'clip' as const }, sessionId: FrameReviewOpaqueId.sessionId('session_clip_0001'), startFrame: 6, endFrame: 47 };
  }
}

function saveWorkflow({ originalName = 'alpha.mp4', answer }: { originalName?: string; answer: SavedRefinedClip }) {
  const saveDialog = new FakeSaveDialog();
  const activityLog = recordedActivityLog();
  const createdClips = { insert: vi.fn((_original: Clip, created: ClipSource): Clip | null => testClip('clip_9', created.name)) };
  const replacements = {
    replace: vi.fn(async (original: Clip, _replacement: ClipSource): Promise<ClipFileReplacementResult | null> => ({ clip: original, failedCollections: [] })),
  };
  const flow = new RefinedClipSaveWorkflow({
    saves: { save: vi.fn(async () => answer), cancelSave: vi.fn(async () => undefined) },
    saveDialog,
    savedClipSources: { clipSourceOf: saved => clipSource(saved.name, { mediaSource: saved.mediaSource }) },
    createdClips,
    replacements,
    reporter: new ActivityReporter(activityLog),
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
    text: new ZoomEditModeText(),
  });
  const original = testClip('clip_1', originalName);
  const edit = { clip: original, folder: { folderPath: 'C:/clips' }, session: new FakeSession() };
  const view: IRefinedClipSaveView = { statusChanged: vi.fn(), endEdit: vi.fn(() => true) };
  const saveWith = (outcome: RefinedClipSaveOutcome) => {
    const ending = flow.save(edit, view);
    saveDialog.emit('confirmed', outcome);
    return ending;
  };
  return { flow, saveDialog, createdClips, replacements, original, edit, view, saveWith, entries: activityLog.entries };
}

describe('RefinedClipSaveWorkflow', () => {
  describe('reports each saved outcome in Activity', () => {
    it.each<[string, string, SavedRefinedClip, string]>([
      ['Keep both', 'alpha.mp4', { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4') },
        'Saved the refined clip as alpha-refined.mp4.'],
      ['Replace refused by the Recycle Bin', 'alpha.mp4',
        { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4'), notice: 'recycle-bin-refused' },
        'Saved the refined clip as alpha-refined.mp4, because alpha.mp4 could not be moved to the Recycle Bin.'],
      ['Replace of a .webm whose .mp4 name is taken', 'alpha.webm',
        { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4'), notice: 'name-taken' },
        'Saved the refined clip as alpha-refined.mp4, because the name it would replace is already taken.'],
      ['Replace', 'alpha.mp4', { outcome: 'replaced', filename: 'alpha.mp4', entry: entry('alpha.mp4') },
        'Replaced alpha.mp4 with the refined clip.'],
      ['Replace of a .webm', 'alpha.webm', { outcome: 'replaced', filename: 'alpha.mp4', entry: entry('alpha.mp4'), replacedFilename: 'alpha.webm' },
        'Replaced alpha.webm with the refined clip alpha.mp4.'],
      ['Replace whose name was taken after the Recycle Bin step', 'alpha.mp4',
        { outcome: 'replaced', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4'), replacedFilename: 'alpha.mp4', notice: 'name-taken' },
        'Moved alpha.mp4 to the Recycle Bin and saved the refined clip as alpha-refined.mp4, because it could not take the original name.'],
      ['Replace whose rename failed after the Recycle Bin step', 'alpha.mp4',
        { outcome: 'replaced', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4'), replacedFilename: 'alpha.mp4', notice: 'rename-failed' },
        'Moved alpha.mp4 to the Recycle Bin and saved the refined clip as alpha-refined.mp4, because it could not take the original name.'],
    ])('%s', async (_case, originalName, answer, message) => {
      const { saveWith, entries } = saveWorkflow({ originalName, answer });

      expect(await saveWith(answer.outcome === 'kept-both' ? 'keep-both' : 'replace')).toBe('saved');

      expect(entries.map(({ kind, message: text }) => [kind, text])).toEqual([['success', message]]);
    });
  });

  it('notes in Activity that the source movie info may be missing when the main process warns', async () => {
    const answer: SavedRefinedClip = {
      outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4'),
      warning: 'Clip saved without source metadata; the metadata writer failed.',
    };
    const { saveWith, entries } = saveWorkflow({ answer });

    await saveWith('keep-both');

    expect(entries.at(-1)).toMatchObject({
      kind: 'information', message: 'The source movie info of alpha-refined.mp4 could not be saved or checked, so it may be missing.',
    });
  });

  it('ends the edit, then adds a clip kept beside its original to the views at the saved file’s address', async () => {
    const answer: SavedRefinedClip = { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4') };
    const { saveWith, createdClips, view, original } = saveWorkflow({ answer });
    let editEndedFirst = false;
    createdClips.insert.mockImplementation(() => { editEndedFirst = vi.mocked(view.endEdit).mock.calls.length === 1; return null; });

    await saveWith('keep-both');

    expect(createdClips.insert.mock.calls.map(([clip, source]) => [clip, source.name, source.mediaSource]))
      .toEqual([[original, 'alpha-refined.mp4', 'file:///C:/clips/alpha-refined.mp4?modified=7']]);
    expect(editEndedFirst).toBe(true);
  });

  it('gives a replaced clip the saved file, under the name it was saved with', async () => {
    const answer: SavedRefinedClip = { outcome: 'replaced', filename: 'alpha.mp4', entry: entry('alpha.mp4'), replacedFilename: 'alpha.webm' };
    const { saveWith, replacements, original } = saveWorkflow({ originalName: 'alpha.webm', answer });

    await saveWith('replace');

    expect(replacements.replace.mock.calls.map(([clip, source]) => [clip, source.name, source.mediaSource]))
      .toEqual([[original, 'alpha.mp4', 'file:///C:/clips/alpha.mp4?modified=7']]);
  });

  it('reports a saved clip the views could not show', async () => {
    const answer: SavedRefinedClip = { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4') };
    const { saveWith, createdClips, entries } = saveWorkflow({ answer });
    createdClips.insert.mockReturnValue(null);

    await saveWith('keep-both');

    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Saved alpha-refined.mp4, but the Collection view could not show it.' });
  });

  it('reports the collections that still list the old name after a .webm Replace', async () => {
    const answer: SavedRefinedClip = { outcome: 'replaced', filename: 'alpha.mp4', entry: entry('alpha.mp4'), replacedFilename: 'alpha.webm' };
    const { saveWith, replacements, entries } = saveWorkflow({ originalName: 'alpha.webm', answer });
    replacements.replace.mockImplementation(async original => ({
      clip: original, failedCollections: [{ filename: 'picks.txt', collectionName: 'picks', error: new Error('EBUSY') }],
    }));

    await saveWith('replace');

    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Could not change alpha.webm to alpha.mp4 in 1 collection.' });
  });

  it('only reports a clip saved after its edit had ended, changing no view', async () => {
    const answer: SavedRefinedClip = { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4') };
    const { saveWith, createdClips, view, entries } = saveWorkflow({ answer });
    vi.mocked(view.endEdit).mockReturnValue(false);

    await saveWith('keep-both');

    expect(createdClips.insert).not.toHaveBeenCalled();
    expect(entries.at(-1)).toMatchObject({ kind: 'success', message: 'Saved the refined clip as alpha-refined.mp4.' });
  });

  it('closes the question and saves nothing when stopped while asking', async () => {
    const answer: SavedRefinedClip = { outcome: 'kept-both', filename: 'alpha-refined.mp4', entry: entry('alpha-refined.mp4') };
    const { flow, saveDialog, edit, view } = saveWorkflow({ answer });
    const ending = flow.save(edit, view);

    flow.stop();

    expect(await ending).toBe('not-saved');
    expect(saveDialog.close).toHaveBeenCalledOnce();
  });
});
