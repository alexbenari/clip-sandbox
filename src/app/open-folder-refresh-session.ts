import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineSession } from './pipeline-session.js';

type OpenFolderRefreshSessionOptions = Readonly<{
  folders: { isActiveFolder(folderSession: FolderAccess | null, folderPath: string): boolean };
  openFolder: Pick<AppSessionState, 'currentFolderSession'>;
  pipelineSession: Pick<PipelineSession, 'hasDirtyClipSequenceChanges'>;
  // Refreshing goes through folder selection, which itself saves first; the composition root closes that loop.
  refreshActiveFolder: () => Promise<void>;
  reporter: Pick<ActivityReporter, 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

export class OpenFolderRefreshSession {
  private pendingFolderPath: string | null = null;

  constructor(private readonly options: OpenFolderRefreshSessionOptions) {}

  async onFolderContentsPublished(folderPath: string): Promise<void> {
    if (!this.isActiveFolder(folderPath)) return;
    if (this.options.pipelineSession.hasDirtyClipSequenceChanges) {
      this.pendingFolderPath = folderPath;
      return;
    }
    await this.refreshActiveFolder();
  }

  async afterCollectionSaved(): Promise<void> {
    const folderPath = this.pendingFolderPath;
    if (!folderPath || !this.isActiveFolder(folderPath)) {
      this.pendingFolderPath = null;
      return;
    }
    if (this.options.pipelineSession.hasDirtyClipSequenceChanges) return;
    this.pendingFolderPath = null;
    await this.refreshActiveFolder();
  }

  private isActiveFolder(folderPath: string): boolean {
    return this.options.folders.isActiveFolder(this.options.openFolder.currentFolderSession, folderPath);
  }

  private async refreshActiveFolder(): Promise<void> {
    try {
      await this.options.refreshActiveFolder();
    } catch (error) {
      this.reportRefreshFailure(error);
    }
  }

  private reportRefreshFailure(error: unknown): void {
    const { reporter, diagnostics, openFolder } = this.options;
    const message = 'The clip was saved, but the Collection view could not refresh.';
    reporter.failure(message, {
      affected: 'Collection refresh',
      recovery: 'Open the folder again to refresh its clips.',
      technicalDetails: reporter.technicalDetailsOf(error),
    });
    void diagnostics.logRuntimeError(message, error, openFolder.currentFolderSession);
  }
}
