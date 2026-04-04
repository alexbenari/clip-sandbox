// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentDirHandle: null,
    idCounter: 0,
    currentCollection: null,
    collectionInventory: null,
  };
}

export function nextClipId(state) {
  state.idCounter += 1;
  return `clip_${state.idCounter}`;
}

export function setCurrentDirHandle(state, handle) {
  state.currentDirHandle = handle || null;
}

export function setCurrentCollection(state, collection) {
  state.currentCollection = collection || null;
}

export function setCollectionInventory(state, inventory) {
  state.collectionInventory = inventory || null;
}

export function resetCollectionState(state) {
  state.currentCollection = null;
  state.collectionInventory = null;
}
