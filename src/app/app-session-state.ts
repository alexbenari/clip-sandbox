import type { IPipelineCatalogEntry } from './pipeline-catalog.js';

export type PendingSelectionAction =
  | { type: 'browse-folder' }
  | { type: 'open-catalog-pipeline'; pipeline: IPipelineCatalogEntry }
  | { type: 'switch-selection'; collectionFilename: string | null }
  | null;

export class AppSessionState {
  currentFolderSession: unknown = null;
  pendingSelectionAction: PendingSelectionAction = null;

  setCurrentFolderSession(folderSession: unknown): void {
    this.currentFolderSession = folderSession || null;
  }

  setPendingSelectionAction(action: PendingSelectionAction): void {
    this.pendingSelectionAction = action || null;
  }

  getPendingSelectionAction(): PendingSelectionAction {
    return this.pendingSelectionAction;
  }

  clearPendingSelectionAction(): void {
    this.pendingSelectionAction = null;
  }
}
