import { sourceBaselineClipNames } from '../domain/clip-sequence-source.js';

// Centralized runtime state for app session.
export function createAppState() {
  return {
    currentFolderSession: null,
    idCounter: 0,
    currentClipSequence: null,
    currentPipeline: null,
    activeSource: null,
    hasDirtyClipSequenceChanges: false,
    pendingSourceAction: null,
  };
}

export function nextClipId(state) {
  state.idCounter += 1;
  return `clip_${state.idCounter}`;
}

export function setCurrentFolderSession(state, folderSession) {
  state.currentFolderSession = folderSession || null;
}

export function setCurrentClipSequence(state, clipSequence) {
  state.currentClipSequence = clipSequence || null;
}

export function setCurrentPipeline(state, pipeline) {
  state.currentPipeline = pipeline || null;
}

export function setActiveSource(state, source) {
  state.activeSource = source || null;
}

export function refreshDirtyClipSequenceState(
  state,
  {
    clipSequence = state.currentClipSequence,
    activeSource = state.activeSource,
  } = {},
) {
  const baseline = sourceBaselineClipNames(activeSource || null);
  const currentNames = clipSequence?.clipNamesInOrder?.() || [];
  state.hasDirtyClipSequenceChanges = currentNames.length !== baseline.length
    || currentNames.some((name, index) => name !== baseline[index]);
  return state.hasDirtyClipSequenceChanges;
}

export function clearDirtyClipSequenceState(state) {
  state.hasDirtyClipSequenceChanges = false;
}

export function setPendingSourceAction(state, action) {
  state.pendingSourceAction = action || null;
}

export function pendingSourceAction(state) {
  return state.pendingSourceAction;
}

export function clearPendingSourceAction(state) {
  state.pendingSourceAction = null;
}

export function resetClipSequenceState(state) {
  state.currentClipSequence = null;
  state.currentPipeline = null;
  state.activeSource = null;
  state.hasDirtyClipSequenceChanges = false;
  state.pendingSourceAction = null;
}
