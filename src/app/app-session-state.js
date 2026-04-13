// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentFolderSession: null,
    idCounter: 0,
    currentCollection: null,
    collectionInventory: null,
    hasDirtyCollectionChanges: false,
    pendingCollectionAction: null,
  };
}

export function nextClipId(state) {
  state.idCounter += 1;
  return `clip_${state.idCounter}`;
}

export function setCurrentFolderSession(state, folderSession) {
  state.currentFolderSession = folderSession || null;
}

export function setCurrentCollection(state, collection) {
  state.currentCollection = collection || null;
}

export function setCollectionInventory(state, inventory) {
  state.collectionInventory = inventory || null;
}

export function refreshDirtyCollectionState(state, { collection = state.currentCollection, inventory = state.collectionInventory } = {}) {
  const baseline = inventory?.activeCollection?.()?.orderedClipNames || [];
  const currentNames = collection?.clipNamesInOrder?.() || [];
  state.hasDirtyCollectionChanges = currentNames.length !== baseline.length
    || currentNames.some((name, index) => name !== baseline[index]);
  return state.hasDirtyCollectionChanges;
}

export function clearDirtyCollectionState(state) {
  state.hasDirtyCollectionChanges = false;
}

export function setPendingCollectionAction(state, action) {
  state.pendingCollectionAction = action || null;
}

export function pendingCollectionAction(state) {
  return state.pendingCollectionAction;
}

export function clearPendingCollectionAction(state) {
  state.pendingCollectionAction = null;
}

export function resetCollectionState(state) {
  state.currentCollection = null;
  state.collectionInventory = null;
  state.hasDirtyCollectionChanges = false;
  state.pendingCollectionAction = null;
}
