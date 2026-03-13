import { describe, expect, test } from 'vitest';
import {
  createAppState,
  nextThumbId,
  setActiveCollectionName,
  setCurrentDirHandle,
  setFsSlots,
  setSelectedThumb,
} from '../../src/state/app-state.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = createAppState();
    expect(state.currentDirHandle).toBeNull();
    expect(state.selectedThumb).toBeNull();
    expect(state.activeCollectionName).toBe('');
    expect(state.fsSlots).toBe(12);
    expect(state.idCounter).toBe(0);
  });

  test('supports named state operations', () => {
    const state = createAppState();
    setSelectedThumb(state, { id: 'x' });
    setCurrentDirHandle(state, { kind: 'directory' });
    setActiveCollectionName(state, 'subset');
    setFsSlots(state, 6);
    expect(state.selectedThumb).toEqual({ id: 'x' });
    expect(state.currentDirHandle).toEqual({ kind: 'directory' });
    expect(state.activeCollectionName).toBe('subset');
    expect(state.fsSlots).toBe(6);
  });

  test('increments generated thumb ids', () => {
    const state = createAppState();
    expect(nextThumbId(state)).toBe('vid_1');
    expect(nextThumbId(state)).toBe('vid_2');
  });
});
