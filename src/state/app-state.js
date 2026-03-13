// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentDirHandle: null,
    selectedThumb: null,
    dragSourceId: null,
    idCounter: 0,
    folderFiles: [],
    folderFileNames: [],
    activeCollectionName: '',
    activeCollectionNames: [],
    activeCollectionSource: 'implicit-folder',
    pendingCollectionConflict: null,
    fsSlots: 12,
    fsHidden: [],
    fsDigitBuffer: '',
    fsDigitTimer: null,
    fsRandInterval: null,
    fsRandPending: false,
    savedTitleHiddenForFS: null,
  };
}

export function nextThumbId(state) {
  state.idCounter += 1;
  return `vid_${state.idCounter}`;
}

export function setSelectedThumb(state, thumb) {
  state.selectedThumb = thumb || null;
}

export function setCurrentDirHandle(state, handle) {
  state.currentDirHandle = handle || null;
}

export function setFolderFiles(state, files) {
  const folderFiles = Array.from(files || []);
  state.folderFiles = folderFiles;
  state.folderFileNames = folderFiles.map((file) => file.name);
}

export function setActiveCollectionName(state, name) {
  state.activeCollectionName = (name || '').trim();
}

export function setActiveCollectionNames(state, names, source = state.activeCollectionSource || 'implicit-folder') {
  state.activeCollectionNames = Array.from(names || []);
  state.activeCollectionSource = source;
}

export function setPendingCollectionConflict(state, conflict) {
  state.pendingCollectionConflict = conflict || null;
}

export function resetCollectionState(state) {
  state.folderFiles = [];
  state.folderFileNames = [];
  state.activeCollectionName = '';
  state.activeCollectionNames = [];
  state.activeCollectionSource = 'implicit-folder';
  state.pendingCollectionConflict = null;
}

export function setFsSlots(state, slots) {
  state.fsSlots = slots;
}
