import type { Clip } from '../domain/clip.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { ClipRenameProblem, IClipRenameService } from './clip-rename-service.js';
import type { IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export type GridRenameRequest = Readonly<{ clipId: string; newFilename: string }>;

export interface IRenamableClipGrid extends IEventSource<{ renameRequested: GridRenameRequest }> {
  beginRename(clipId: string): void;
  showRenameProblem(clipId: string, problem: ClipRenameProblem): void;
  endRename(clipId: string): void;
  focusClip(clipId: string): boolean;
}

export interface IRenamedClips {
  rename(clip: Clip, renamed: ClipSource): Promise<Clip | null>;
}

type ClipRenameDependencies = Readonly<{
  grid: IRenamableClipGrid;
  renames: IClipRenameService;
  renamedClips: IRenamedClips;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'resolveClip'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  reporter: Pick<ActivityReporter, 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

export class ClipRenameWorkflow {
  private readonly renaming = new Set<string>();
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: ClipRenameDependencies) {
    this.unsubscribes = [deps.grid.on('renameRequested', request => { void this.rename(request); })];
  }

  begin(clipId: string): void {
    this.deps.grid.beginRename(clipId);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private async rename({ clipId, newFilename }: GridRenameRequest): Promise<void> {
    const { grid, pipelineWorkingCopy, openFolder } = this.deps;
    const clip = pipelineWorkingCopy.resolveClip(clipId);
    const folder = openFolder.currentFolderAccess;
    if (!clip || !folder || newFilename === clip.name) {
      grid.endRename(clipId);
      return;
    }
    if (this.renaming.has(clipId)) return;
    this.renaming.add(clipId);
    try {
      await this.renameFile(clip, folder, newFilename);
    } finally {
      this.renaming.delete(clipId);
    }
  }

  private async renameFile(clip: Clip, folder: FolderAccess, newFilename: string): Promise<void> {
    const { grid, renames, openFolder } = this.deps;
    let renamed: ClipSource;
    try {
      const answer = await renames.rename({ folder, filename: clip.name, newFilename });
      if (answer.kind === 'refused') {
        grid.showRenameProblem(clip.id, answer.reason);
        return;
      }
      renamed = answer.source;
    } catch (error) {
      grid.showRenameProblem(clip.id, 'failed');
      this.reportFailure(`Could not rename ${clip.name}.`, clip.name, 'Check that no other program is using the file, then try again.', error);
      return;
    }
    grid.endRename(clip.id);
    // A folder opened meanwhile lists the file under its new name already.
    if (openFolder.currentFolderAccess !== folder) return;
    await this.showRenamed(clip, renamed);
  }

  private async showRenamed(clip: Clip, renamed: ClipSource): Promise<void> {
    try {
      const shown = await this.deps.renamedClips.rename(clip, renamed);
      if (shown) this.deps.grid.focusClip(shown.id);
    } catch (error) {
      this.reportFailure(`Renamed ${clip.name} to ${renamed.name}, but the Collection view could not show it.`, renamed.name,
        'Open the folder again to see the clip under its new name.', error);
    }
  }

  private reportFailure(problem: string, affected: string, recovery: string, error: unknown): void {
    const { reporter, diagnostics } = this.deps;
    reporter.failure(problem, { affected, recovery, technicalDetails: reporter.technicalDetailsOf(error) });
    void diagnostics.logRuntimeError(problem, error);
  }
}
