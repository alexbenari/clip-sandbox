import { describe, expect, test } from 'vitest';
import {
  createAppState,
  nextClipId,
  setCollectionInventory,
  setCurrentCollection,
  setCurrentDirHandle,
} from '../../src/app/app-session-state.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = createAppState();
    expect(state.currentDirHandle).toBeNull();
    expect(state.currentCollection).toBeNull();
    expect(state.collectionInventory).toBeNull();
    expect(state.idCounter).toBe(0);
  });

  test('supports named state operations', () => {
    const state = createAppState();
    setCurrentDirHandle(state, { kind: 'directory' });
    setCurrentCollection(state, { name: 'subset' });
    setCollectionInventory(state, { folderName: 'clips' });
    expect(state.currentDirHandle).toEqual({ kind: 'directory' });
    expect(state.currentCollection).toEqual({ name: 'subset' });
    expect(state.collectionInventory).toEqual({ folderName: 'clips' });
  });

  test('increments generated clip ids', () => {
    const state = createAppState();
    expect(nextClipId(state)).toBe('clip_1');
    expect(nextClipId(state)).toBe('clip_2');
  });
});
