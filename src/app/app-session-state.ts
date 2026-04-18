// @ts-nocheck
export class AppSessionState {
  currentFolderSession = null;
  idCounter = 0;
  currentClipSequence = null;
  currentPipeline = null;
  activeCollection = null;
  hasDirtyClipSequenceChanges = false;
  pendingSelectionAction = null;

  nextClipId() {
    this.idCounter += 1;
    return `clip_${this.idCounter}`;
  }

  setCurrentFolderSession(folderSession) {
    this.currentFolderSession = folderSession || null;
  }

  setCurrentClipSequence(clipSequence) {
    this.currentClipSequence = clipSequence || null;
  }

  setCurrentPipeline(pipeline) {
    this.currentPipeline = pipeline || null;
  }

  setActiveCollection(collection) {
    this.activeCollection = collection || null;
  }

  refreshDirtyClipSequenceState({
    clipSequence = this.currentClipSequence,
    activeCollection = this.activeCollection,
    currentPipeline = this.currentPipeline,
  } = {}) {
    const baseline = activeCollection
      ? activeCollection.orderedClipNames
      : (currentPipeline?.videoNames?.() || []);
    const currentNames = clipSequence?.clipNamesInOrder?.() || [];
    this.hasDirtyClipSequenceChanges = currentNames.length !== baseline.length
      || currentNames.some((name, index) => name !== baseline[index]);
    return this.hasDirtyClipSequenceChanges;
  }

  clearDirtyClipSequenceState() {
    this.hasDirtyClipSequenceChanges = false;
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

  resetClipSequenceState() {
    this.currentClipSequence = null;
    this.currentPipeline = null;
    this.activeCollection = null;
    this.hasDirtyClipSequenceChanges = false;
    this.pendingSelectionAction = null;
  }
}

export function createAppState() {
  return new AppSessionState();
}
