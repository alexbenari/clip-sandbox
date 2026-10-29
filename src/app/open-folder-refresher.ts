import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { FolderAccess } from './folder-access.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

type OpenFolderRefresherOptions = Readonly<{
  folders: { isActiveFolder(folderAccess: FolderAccess | null, folderPath: string): boolean };
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'hasDirtyClipSequenceChanges'>;
  activeEdit: Pick<ActiveZoomEdit, 'isActive'>;
  // Refreshing goes through folder selection, which itself saves first; the composition root closes that loop.
  refreshActiveFolder: () => Promise<void>;
  reporter: Pick<ActivityReporter, 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

export class OpenFolderRefresher {
  private pendingFolderPath: string | null = null;

  constructor(private readonly options: OpenFolderRefresherOptions) {}

  async onFolderContentsPublished(folderPath: string): Promise<void> {
    if (!this.isActiveFolder(folderPath)) return;
    if (this.mustWait()) {
      this.pendingFolderPath = folderPath;
      return;
    }
    await this.refreshActiveFolder();
  }

  afterCollectionSaved(): Promise<void> {
    return this.runPendingRefresh();
  }

  afterZoomEditModeEnded(): Promise<void> {
    return this.runPendingRefresh();
  }

  private async runPendingRefresh(): Promise<void> {
    const folderPath = this.pendingFolderPath;
    if (!folderPath || !this.isActiveFolder(folderPath)) {
      this.pendingFolderPath = null;
      return;
    }
    if (this.mustWait()) return;
    this.pendingFolderPath = null;
    await this.refreshActiveFolder();
  }

  private mustWait(): boolean {
    return this.options.pipelineWorkingCopy.hasDirtyClipSequenceChanges || this.options.activeEdit.isActive;
  }

  private isActiveFolder(folderPath: string): boolean {
    return this.options.folders.isActiveFolder(this.options.openFolder.currentFolderAccess, folderPath);
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
    void diagnostics.logRuntimeError(message, error, openFolder.currentFolderAccess);
  }
}
