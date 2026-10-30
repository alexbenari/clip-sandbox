import type { Clip } from '../domain/clip.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { ClipSourceMovieReport, IClipSourceMovieService } from './clip-source-movie-service.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export interface ISourceMovieGlyphs {
  refreshSourceMovieGlyphs(): void;
}

type ClipSourceMovieDependencies = Readonly<{
  service: IClipSourceMovieService | null;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  grid: ISourceMovieGlyphs;
  reporter: Pick<ActivityReporter, 'information'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  appText: Pick<AppText, 'unreadableSourceMoviesText' | 'sourceMovieReadFailedText'>;
}>;

type SourceMovieRead = Readonly<{
  folder: FolderAccess;
  pipeline: Pipeline;
  clipNames: string[];
  isLatestRequest: () => boolean;
}>;

export class ClipSourceMovieRefresher {
  private folderReadRevision = 0;
  private disposed = false;

  constructor(private readonly sourceMovies: ClipSourceMovieDependencies) {}

  dispose(): void {
    this.disposed = true;
  }

  async readFolderClips(folder: FolderAccess): Promise<void> {
    const pipeline = this.sourceMovies.pipelineWorkingCopy.pipeline;
    if (!pipeline) return;
    const revision = ++this.folderReadRevision;
    await this.readAndApply({ folder, pipeline, clipNames: pipeline.videoNames(), isLatestRequest: () => revision === this.folderReadRevision });
  }

  async readClip(clip: Clip): Promise<void> {
    const folder = this.sourceMovies.openFolder.currentFolderAccess;
    const pipeline = this.sourceMovies.pipelineWorkingCopy.pipeline;
    if (folder && pipeline) await this.readAndApply({ folder, pipeline, clipNames: [clip.name], isLatestRequest: () => true });
  }

  // Each folder load builds a new pipeline, so an unchanged pipeline means the answer still belongs to the open folder.
  private async readAndApply({ folder, pipeline, clipNames, isLatestRequest }: SourceMovieRead): Promise<void> {
    const { service } = this.sourceMovies;
    if (!service || this.disposed) return;
    const isStillWanted = () => !this.disposed && isLatestRequest() && this.sourceMovies.pipelineWorkingCopy.pipeline === pipeline;
    let report: ClipSourceMovieReport;
    try {
      report = await service.readClips(folder, clipNames);
    } catch (error) {
      if (isStillWanted()) this.reportReadFailure(folder, pipeline, error);
      return;
    }
    if (isStillWanted()) this.apply(pipeline, report);
  }

  private reportReadFailure(folder: FolderAccess, pipeline: Pipeline, error: unknown): void {
    this.sourceMovies.reporter.information(this.sourceMovies.appText.sourceMovieReadFailedText(pipeline.displayLabel()));
    void this.sourceMovies.diagnostics.logRuntimeError('Failed to read source movie info.', error, folder);
  }

  private apply(pipeline: Pipeline, report: ClipSourceMovieReport): void {
    const clipsByName = pipeline.clipMap();
    for (const clipName of report.clipNames()) {
      clipsByName.get(clipName)?.recordSourceMovie(report.sourceMovieOf(clipName));
    }
    this.sourceMovies.grid.refreshSourceMovieGlyphs();
    if (report.unreadableCount > 0) {
      this.sourceMovies.reporter.information(this.sourceMovies.appText.unreadableSourceMoviesText(report.unreadableCount));
    }
  }
}
