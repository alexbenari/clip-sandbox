import type { FolderAccess } from './folder-access.js';

export class AppSessionState {
  currentFolderSession: FolderAccess | null = null;

  setCurrentFolderSession(folderSession: FolderAccess | null): void {
    this.currentFolderSession = folderSession || null;
  }
}
