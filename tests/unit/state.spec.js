import { describe, expect, test } from 'vitest';
import {
  clearDirtyCollectionState,
  clearPendingCollectionAction,
  createAppState,
  nextClipId,
  pendingCollectionAction,
  refreshDirtyCollectionState,
  setCollectionInventory,
  setCurrentCollection,
  setCurrentFolderSession,
  setPendingCollectionAction,
} from '../../src/app/app-session-state.js';
import { Clip } from '../../src/domain/clip.js';
import { ClipCollection } from '../../src/domain/clip-collection.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = createAppState();
    expect(state.currentFolderSession).toBeNull();
    expect(state.currentCollection).toBeNull();
    expect(state.collectionInventory).toBeNull();
    expect(state.idCounter).toBe(0);
    expect(state.hasDirtyCollectionChanges).toBe(false);
    expect(state.pendingCollectionAction).toBeNull();
  });

  test('supports named state operations', () => {
    const state = createAppState();
    setCurrentFolderSession(state, { accessMode: 'readwrite' });
    setCurrentCollection(state, { name: 'subset' });
    setCollectionInventory(state, { folderName: 'clips' });
    setPendingCollectionAction(state, { type: 'browse-folder' });
    expect(state.currentFolderSession).toEqual({ accessMode: 'readwrite' });
    expect(state.currentCollection).toEqual({ name: 'subset' });
    expect(state.collectionInventory).toEqual({ folderName: 'clips' });
    expect(pendingCollectionAction(state)).toEqual({ type: 'browse-folder' });
    clearPendingCollectionAction(state);
    expect(pendingCollectionAction(state)).toBeNull();
  });

  test('increments generated clip ids', () => {
    const state = createAppState();
    expect(nextClipId(state)).toBe('clip_1');
    expect(nextClipId(state)).toBe('clip_2');
  });

  test('tracks dirty collection state against the active inventory content', () => {
    const state = createAppState();
    const collection = new ClipCollection({
      name: 'clips-default',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });
    setCollectionInventory(state, {
      activeCollection: () => ({
        orderedClipNames: ['alpha.mp4', 'bravo.webm'],
      }),
    });
    setCurrentCollection(state, collection);

    expect(refreshDirtyCollectionState(state)).toBe(false);
    collection.remove('clip_2');
    expect(refreshDirtyCollectionState(state)).toBe(true);
    clearDirtyCollectionState(state);
    expect(state.hasDirtyCollectionChanges).toBe(false);
  });
});
