import type { FolderAccess } from './folder-access.js';

export class AppSessionState {
  currentFolderAccess: FolderAccess | null = null;

  setCurrentFolderAccess(folderAccess: FolderAccess | null): void {
    this.currentFolderAccess = folderAccess || null;
  }
}
