// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { createAppState } from '../../src/app/app-session-state.js';
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

    state.setCurrentFolderSession({ accessMode: 'readwrite' });
    state.setCurrentClipSequence(sequence);
    state.setCurrentPipeline(pipeline);
    state.setActiveCollection(source);
    state.setPendingSelectionAction({ type: 'browse-folder' });

    expect(state.currentFolderSession).toEqual({ accessMode: 'readwrite' });
    expect(state.currentClipSequence).toBe(sequence);
    expect(state.currentPipeline).toBe(pipeline);
    expect(state.activeCollection).toBe(source);
    expect(state.getPendingSelectionAction()).toEqual({ type: 'browse-folder' });

    state.clearPendingSelectionAction();
    expect(state.getPendingSelectionAction()).toBeNull();
  });

  test('increments generated clip ids', () => {
    const state = createAppState();
    expect(state.nextClipId()).toBe('clip_1');
    expect(state.nextClipId()).toBe('clip_2');
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

    state.setActiveCollection(source);
    state.setCurrentClipSequence(clipSequence);

    expect(state.refreshDirtyClipSequenceState()).toBe(false);
    clipSequence.remove('clip_2');
    expect(state.refreshDirtyClipSequenceState()).toBe(true);
    state.clearDirtyClipSequenceState();
    expect(state.hasDirtyClipSequenceChanges).toBe(false);
  });
});

