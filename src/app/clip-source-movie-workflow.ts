import type { Clip } from '../domain/clip.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
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
  appText: Pick<AppText, 'unreadableSourceMoviesText' | 'sourceMovieReadFailedText'>;
}>;

type SourceMovieRead = Readonly<{
  folder: FolderAccess;
  pipeline: Pipeline;
  clipNames: string[];
  isLatestRequest: () => boolean;
}>;

export class ClipSourceMovieWorkflow {
  private folderReadRevision = 0;

  constructor(private readonly sourceMovies: ClipSourceMovieDependencies) {}

  async readFolderClips(folder: FolderAccess): Promise<void> {
    const pipeline = this.sourceMovies.pipelineWorkingCopy.pipeline;
    if (!pipeline) return;
    const revision = ++this.folderReadRevision;
    await this.readAndApply({ folder, pipeline, clipNames: pipeline.videoNames(), isLatestRequest: () => revision === this.folderReadRevision });
  }

  async readCreatedClip(clip: Clip): Promise<void> {
    const folder = this.sourceMovies.openFolder.currentFolderAccess;
    const pipeline = this.sourceMovies.pipelineWorkingCopy.pipeline;
    if (folder && pipeline) await this.readAndApply({ folder, pipeline, clipNames: [clip.name], isLatestRequest: () => true });
  }

  // Each folder load builds a new pipeline, so an unchanged pipeline means the answer still belongs to the open folder.
  private async readAndApply({ folder, pipeline, clipNames, isLatestRequest }: SourceMovieRead): Promise<void> {
    const { service } = this.sourceMovies;
    if (!service) return;
    const isStillWanted = () => isLatestRequest() && this.sourceMovies.pipelineWorkingCopy.pipeline === pipeline;
    let report: ClipSourceMovieReport;
    try {
      report = await service.readClips(folder, clipNames);
    } catch {
      if (isStillWanted()) this.sourceMovies.reporter.information(this.sourceMovies.appText.sourceMovieReadFailedText(pipeline.displayLabel()));
      return;
    }
    if (isStillWanted()) this.apply(pipeline, report);
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
