import { describe, expect, test } from 'vitest';
import {
  createAppState,
  nextClipId,
  setCurrentCollection,
  setCurrentDirHandle,
} from '../../src/app/app-state.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = createAppState();
    expect(state.currentDirHandle).toBeNull();
    expect(state.folderClips).toEqual([]);
    expect(state.currentCollection).toBeNull();
    expect(state.idCounter).toBe(0);
  });

  test('supports named state operations', () => {
    const state = createAppState();
    setCurrentDirHandle(state, { kind: 'directory' });
    setCurrentCollection(state, { name: 'subset' });
    expect(state.currentDirHandle).toEqual({ kind: 'directory' });
    expect(state.currentCollection).toEqual({ name: 'subset' });
  });

  test('increments generated clip ids', () => {
    const state = createAppState();
    expect(nextClipId(state)).toBe('clip_1');
    expect(nextClipId(state)).toBe('clip_2');
  });
});
