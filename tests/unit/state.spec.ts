// @ts-nocheck
import { describe, expect, test } from 'vitest';
import {
  clearDirtyClipSequenceState,
  clearPendingSelectionAction,
  createAppState,
  nextClipId,
  pendingSelectionAction,
  refreshDirtyClipSequenceState,
  setActiveCollection,
  setCurrentClipSequence,
  setCurrentFolderSession,
  setCurrentPipeline,
  setPendingSelectionAction,
} from '../../src/app/app-session-state.js';
import { Clip } from '../../src/domain/clip.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = createAppState();
    expect(state.currentFolderSession).toBeNull();
    expect(state.currentClipSequence).toBeNull();
    expect(state.currentPipeline).toBeNull();
    expect(state.activeCollection).toBeNull();
    expect(state.idCounter).toBe(0);
    expect(state.hasDirtyClipSequenceChanges).toBe(false);
    expect(state.pendingSelectionAction).toBeNull();
  });

  test('supports named state operations', () => {
    const state = createAppState();
    const pipeline = new Pipeline({ folderName: 'clips' });
    const sequence = new ClipSequence({ name: 'clips' });
    const source = Collection.fromFilename({ filename: 'subset.txt', orderedClipNames: [] });

    setCurrentFolderSession(state, { accessMode: 'readwrite' });
    setCurrentClipSequence(state, sequence);
    setCurrentPipeline(state, pipeline);
    setActiveCollection(state, source);
    setPendingSelectionAction(state, { type: 'browse-folder' });

    expect(state.currentFolderSession).toEqual({ accessMode: 'readwrite' });
    expect(state.currentClipSequence).toBe(sequence);
    expect(state.currentPipeline).toBe(pipeline);
    expect(state.activeCollection).toBe(source);
    expect(pendingSelectionAction(state)).toEqual({ type: 'browse-folder' });

    clearPendingSelectionAction(state);
    expect(pendingSelectionAction(state)).toBeNull();
  });

  test('increments generated clip ids', () => {
    const state = createAppState();
    expect(nextClipId(state)).toBe('clip_1');
    expect(nextClipId(state)).toBe('clip_2');
  });

  test('tracks dirty clip-sequence state against the active collection baseline', () => {
    const state = createAppState();
    const source = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.webm'],
    });
    const clipSequence = new ClipSequence({
      name: 'subset',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });

    setActiveCollection(state, source);
    setCurrentClipSequence(state, clipSequence);

    expect(refreshDirtyClipSequenceState(state)).toBe(false);
    clipSequence.remove('clip_2');
    expect(refreshDirtyClipSequenceState(state)).toBe(true);
    clearDirtyClipSequenceState(state);
    expect(state.hasDirtyClipSequenceChanges).toBe(false);
  });
});

