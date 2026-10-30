import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import type { ClipRenameAnswer, ClipRenameProblem, IClipRenameRequest } from '../../src/app/clip-rename-service.js';
import { ClipRenameWorkflow, type GridRenameRequest } from '../../src/app/clip-rename-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Clip } from '../../src/domain/clip.js';
import type { ClipSource } from '../../src/domain/clip-source.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';
import { deferred, type Deferred } from '../support/deferred.js';
import { flushPendingWork } from '../support/flush-pending-work.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

class FakeGrid extends EventSource<{ renameRequested: GridRenameRequest }> {
  editing: string | null = null;
  problems: [string, ClipRenameProblem][] = [];
  focused: string[] = [];
  beginRename(clipId: string) { this.editing = clipId; }
  showRenameProblem(clipId: string, problem: ClipRenameProblem) { this.problems.push([clipId, problem]); }
  endRename(clipId: string) { if (this.editing === clipId) this.editing = null; }
  focusClip(clipId: string) { this.focused.push(clipId); return true; }
}

function clipRename() {
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4'), clipSource('bravo.mp4')] }));
  const [alpha] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const openFolder = new AppSessionState();
  const folder = { folderPath: 'C:/clips' };
  openFolder.setCurrentFolderAccess(folder);
  const grid = new FakeGrid();
  const answers: Deferred<ClipRenameAnswer>[] = [];
  const renames = {
    rename: vi.fn((_request: IClipRenameRequest) => {
      const answer = deferred<ClipRenameAnswer>();
      answers.push(answer);
      return answer.promise;
    }),
  };
  // A folder view lists the renamed file as a new clip.
  const shownClip = new Clip({ id: 'clip_9', source: clipSource('sunset.mp4') });
  const renamedClips = { rename: vi.fn(async (_clip: Clip, _renamed: ClipSource): Promise<Clip | null> => shownClip) };
  const activityLog = recordedActivityLog();
  const workflow = new ClipRenameWorkflow({
    grid, renames, renamedClips, pipelineWorkingCopy, openFolder,
    reporter: new ActivityReporter(activityLog),
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
  });
  workflow.begin(alpha.id);
  const request = (newFilename: string) => grid.emit('renameRequested', { clipId: alpha.id, newFilename });
  return { workflow, grid, renames, renamedClips, answers, alpha, folder, openFolder, request, entries: activityLog.entries };
}

describe('ClipRenameWorkflow', () => {
  it('starts editing the name of the clip it is asked to rename', () => {
    const { grid, alpha } = clipRename();

    expect(grid.editing).toBe(alpha.id);
  });

  it('renames the clip in its folder and shows it under the new name in the views', async () => {
    const { renames, renamedClips, answers, alpha, folder, request } = clipRename();

    request('sunset.mp4');
    const renamed = clipSource('sunset.mp4');
    answers[0].resolve({ kind: 'renamed', source: renamed });
    await flushPendingWork();

    expect(renames.rename).toHaveBeenCalledWith({ folder, filename: 'alpha.mp4', newFilename: 'sunset.mp4' });
    expect(renamedClips.rename).toHaveBeenCalledWith(alpha, renamed);
  });

  it('ends the editing and focuses the clip the views show under the new name', async () => {
    const { grid, answers, request } = clipRename();

    request('sunset.mp4');
    answers[0].resolve({ kind: 'renamed', source: clipSource('sunset.mp4') });
    await flushPendingWork();

    expect(grid.editing).toBeNull();
    expect(grid.focused).toEqual(['clip_9']);
  });

  it('keeps the name being edited and says why when the name is refused', async () => {
    const { grid, renamedClips, answers, alpha, request } = clipRename();

    request('bravo.mp4');
    answers[0].resolve({ kind: 'refused', reason: 'name-taken' });
    await flushPendingWork();

    expect(grid.problems).toEqual([[alpha.id, 'name-taken']]);
    expect(grid.editing).toBe(alpha.id);
    expect(renamedClips.rename).not.toHaveBeenCalled();
  });

  it('ends editing without asking to rename when the name did not change', () => {
    const { grid, renames, request } = clipRename();

    request('alpha.mp4');

    expect(grid.editing).toBeNull();
    expect(renames.rename).not.toHaveBeenCalled();
  });

  it('asks once while a rename of the clip is under way', () => {
    const { renames, request } = clipRename();

    request('sunset.mp4');
    request('sunset.mp4');

    expect(renames.rename).toHaveBeenCalledOnce();
  });

  it('reports a rename that failed and keeps the name being edited', async () => {
    const { grid, answers, alpha, request, entries } = clipRename();

    request('sunset.mp4');
    answers[0].reject(new Error('EBUSY'));
    await flushPendingWork();

    expect(grid.problems).toEqual([[alpha.id, 'failed']]);
    expect(grid.editing).toBe(alpha.id);
    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Could not rename alpha.mp4.' });
  });

  it('reports a renamed clip the views could not show as renamed, not as a failed rename', async () => {
    const { grid, renamedClips, answers, request, entries } = clipRename();
    renamedClips.rename.mockRejectedValue(new Error('view failed'));

    request('sunset.mp4');
    answers[0].resolve({ kind: 'renamed', source: clipSource('sunset.mp4') });
    await flushPendingWork();

    expect(grid.problems).toEqual([]);
    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Renamed alpha.mp4 to sunset.mp4, but the Collection view could not show it.' });
  });

  it('leaves the views alone when another folder was opened before the rename finished', async () => {
    const { renamedClips, answers, openFolder, request } = clipRename();

    request('sunset.mp4');
    openFolder.setCurrentFolderAccess({ folderPath: 'C:/other' });
    answers[0].resolve({ kind: 'renamed', source: clipSource('sunset.mp4') });
    await flushPendingWork();

    expect(renamedClips.rename).not.toHaveBeenCalled();
  });

  it('stops reacting to rename requests once disposed', () => {
    const { workflow, renames, request } = clipRename();

    workflow.dispose();
    request('sunset.mp4');

    expect(renames.rename).not.toHaveBeenCalled();
  });
});
