// @ts-nocheck
export class AppSessionState {
  currentFolderSession = null;
  pendingSelectionAction = null;

  setCurrentFolderSession(folderSession) {
    this.currentFolderSession = folderSession || null;
  }

  setPendingSelectionAction(action) {
    this.pendingSelectionAction = action || null;
  }

  getPendingSelectionAction() {
    return this.pendingSelectionAction;
  }

  clearPendingSelectionAction() {
    this.pendingSelectionAction = null;
  }
}

export function createAppState() {
  return new AppSessionState();
}
