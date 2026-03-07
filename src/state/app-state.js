// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentDirHandle: null,
    selectedThumb: null,
    dragSourceId: null,
    idCounter: 0,
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

export function setFsSlots(state, slots) {
  state.fsSlots = slots;
}
