// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import { ClipSourceMovieReport, type IClipSourceMovieService } from '../../src/app/clip-source-movie-service.js';
import { ClipSourceMovieRefresher } from '../../src/app/clip-source-movie-refresher.js';
import type { FolderAccess } from '../../src/app/folder-access.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { SourceMovie } from '../../src/domain/source-movie.js';
import { clipSource } from '../support/clip-source-fixtures.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

type Answer = Readonly<Record<string, string | null | 'unreadable'>>;

class ScriptedSourceMovieService implements IClipSourceMovieService {
  readonly requests: { folder: FolderAccess; clipNames: readonly string[]; answer: (answer: Answer) => void; fail: (error: Error) => void }[] = [];

  readClips(folder: FolderAccess, clipNames: readonly string[]): Promise<ClipSourceMovieReport> {
    return new Promise((resolve, reject) => {
      this.requests.push({
        folder,
        clipNames,
        answer: answer => resolve(this.report(answer)),
        fail: reject,
      });
    });
  }

  private report(answer: Answer): ClipSourceMovieReport {
    const movies = new Map(Object.entries(answer).map(([name, movie]) => [
      name, movie && movie !== 'unreadable' ? SourceMovie.fromFileName(movie) : null,
    ]));
    return new ClipSourceMovieReport(movies, Object.values(answer).filter(movie => movie === 'unreadable').length);
  }
}

function sourceMovieRefresher() {
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  const openFolder = new AppSessionState();
  const service = new ScriptedSourceMovieService();
  const grid = { refreshSourceMovieGlyphs: vi.fn() };
  const activityLog = recordedActivityLog();
  const diagnostics = { logRuntimeError: vi.fn(async (_problem: string, _error: unknown, _folder?: FolderAccess | null) => undefined) };
  const refresher = new ClipSourceMovieRefresher({
    service,
    pipelineWorkingCopy,
    openFolder,
    grid,
    reporter: new ActivityReporter(activityLog),
    diagnostics,
    appText: new AppText(),
  });
  const openPipeline = (folderName: string, clipNames: string[]) => {
    const folder = { folderPath: `C:/${folderName}` };
    pipelineWorkingCopy.loadPipeline(new Pipeline({ folderName, videoSources: clipNames.map(name => clipSource(name)) }));
    openFolder.setCurrentFolderAccess(folder);
    return folder;
  };
  const clipNamed = (name: string) => pipelineWorkingCopy.pipeline!.clipMap().get(name)!;
  return { refresher, service, grid, diagnostics, entries: activityLog.entries, openPipeline, clipNamed, pipelineWorkingCopy };
}

describe('ClipSourceMovieRefresher', () => {
  it('asks for every clip of the open folder and gives each clip its source movie', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4', 'bravo.mp4']);

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].answer({ 'alpha.mp4': 'Sample Feature.mkv', 'bravo.mp4': null });
    await reading;

    expect(context.service.requests.map(request => [request.folder, request.clipNames])).toEqual([[folder, ['alpha.mp4', 'bravo.mp4']]]);
    expect(context.clipNamed('alpha.mp4').sourceMovie?.name).toBe('Sample Feature');
    expect(context.clipNamed('bravo.mp4').sourceMovie).toBeNull();
    expect(context.grid.refreshSourceMovieGlyphs).toHaveBeenCalled();
  });

  it('ignores an answer that arrives after another folder was opened', async () => {
    const context = sourceMovieRefresher();
    const firstFolder = context.openPipeline('clips', ['alpha.mp4']);
    const firstAlpha = context.clipNamed('alpha.mp4');
    const reading = context.refresher.readFolderClips(firstFolder);
    context.openPipeline('archive', ['alpha.mp4']);

    context.service.requests[0].answer({ 'alpha.mp4': 'Sample Feature.mkv' });
    await reading;

    expect(firstAlpha.sourceMovie).toBeNull();
    expect(context.clipNamed('alpha.mp4').sourceMovie).toBeNull();
    expect(context.grid.refreshSourceMovieGlyphs).not.toHaveBeenCalled();
  });

  it('ignores an older folder answer once a newer folder read has begun', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    const olderReading = context.refresher.readFolderClips(folder);
    const newerReading = context.refresher.readFolderClips(folder);
    context.service.requests[1].answer({ 'alpha.mp4': 'Newer Feature.mkv' });
    await newerReading;

    context.service.requests[0].answer({ 'alpha.mp4': 'Older Feature.mkv' });
    await olderReading;

    expect(context.clipNamed('alpha.mp4').sourceMovie?.name).toBe('Newer Feature');
  });

  it('keeps a clip\'s source movie while its next answer is pending', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    context.clipNamed('alpha.mp4').recordSourceMovie(SourceMovie.fromFileName('Sample Feature.mkv'));

    void context.refresher.readFolderClips(folder);

    expect(context.service.requests).toHaveLength(1);
    expect(context.clipNamed('alpha.mp4').sourceMovie?.name).toBe('Sample Feature');
  });

  it('replaces a clip\'s source movie with the newest answer', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    context.clipNamed('alpha.mp4').recordSourceMovie(SourceMovie.fromFileName('Sample Feature.mkv'));

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].answer({ 'alpha.mp4': null });
    await reading;

    expect(context.clipNamed('alpha.mp4').sourceMovie).toBeNull();
  });

  it('reads only the one clip it is given, such as a clip an edit saved', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4', 'alpha-looped.mp4']);

    const reading = context.refresher.readClip(context.clipNamed('alpha-looped.mp4'));
    context.service.requests[0].answer({ 'alpha-looped.mp4': 'Sample Feature.mkv' });
    await reading;

    expect(context.service.requests.map(request => [request.folder, request.clipNames])).toEqual([[folder, ['alpha-looped.mp4']]]);
    expect(context.clipNamed('alpha-looped.mp4').sourceMovie?.name).toBe('Sample Feature');
  });

  it('notes in Activity how many clips could not be read', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4', 'bravo.mp4', 'charlie.mp4']);

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].answer({ 'alpha.mp4': 'unreadable', 'bravo.mp4': 'unreadable', 'charlie.mp4': null });
    await reading;

    expect(context.entries).toEqual([{ kind: 'information', message: new AppText().unreadableSourceMoviesText(2) }]);
  });

  it('notes in Activity when the folder could not be read', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].fail(new Error('Folder access is unavailable for this folder session.'));
    await reading;

    expect(context.entries).toEqual([{ kind: 'information', message: new AppText().sourceMovieReadFailedText('clips') }]);
  });

  it('writes a failed folder read to the error log of that folder', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    const failure = new Error('Folder access is unavailable for this folder session.');

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].fail(failure);
    await reading;

    expect(context.diagnostics.logRuntimeError.mock.calls).toEqual([[expect.any(String), failure, folder]]);
  });

  it('starts no read after shutdown began', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    context.refresher.dispose();

    await context.refresher.readFolderClips(folder);

    expect(context.service.requests).toEqual([]);
  });

  it('ignores an answer that arrives after shutdown began', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4']);
    const reading = context.refresher.readFolderClips(folder);

    context.refresher.dispose();
    context.service.requests[0].answer({ 'alpha.mp4': 'Sample Feature.mkv' });
    await reading;

    expect(context.clipNamed('alpha.mp4').sourceMovie).toBeNull();
    expect(context.grid.refreshSourceMovieGlyphs).not.toHaveBeenCalled();
  });

  it('adds nothing to Activity when every clip was read', async () => {
    const context = sourceMovieRefresher();
    const folder = context.openPipeline('clips', ['alpha.mp4', 'bravo.mp4']);

    const reading = context.refresher.readFolderClips(folder);
    context.service.requests[0].answer({ 'alpha.mp4': 'Sample Feature.mkv', 'bravo.mp4': null });
    await reading;

    expect(context.entries).toEqual([]);
  });
});
