export class AppSessionState {
  currentFolderSession: unknown = null;

  setCurrentFolderSession(folderSession: unknown): void {
    this.currentFolderSession = folderSession || null;
  }
}
