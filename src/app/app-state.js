// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentDirHandle: null,
    idCounter: 0,
    folderClips: [],
    currentCollection: null,
  };
}

export function nextClipId(state) {
  state.idCounter += 1;
  return `clip_${state.idCounter}`;
}

export function setCurrentDirHandle(state, handle) {
  state.currentDirHandle = handle || null;
}

export function setFolderClips(state, clips) {
  state.folderClips = Array.from(clips || []);
}

export function setCurrentCollection(state, collection) {
  state.currentCollection = collection || null;
}

export function resetCollectionState(state) {
  state.folderClips = [];
  state.currentCollection = null;
}
