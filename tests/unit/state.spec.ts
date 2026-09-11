// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AppSessionState } from '../../src/app/app-session-state.js';

describe('app state', () => {
  test('creates default state shape', () => {
    const state = new AppSessionState();
    expect(state.currentFolderSession).toBeNull();
    expect(state.pendingSelectionAction).toBeNull();
  });

  test('supports named state operations', () => {
    const state = new AppSessionState();

    state.setCurrentFolderSession({ accessMode: 'readwrite' });
    state.setPendingSelectionAction({ type: 'browse-folder' });

    expect(state.currentFolderSession).toEqual({ accessMode: 'readwrite' });
    expect(state.getPendingSelectionAction()).toEqual({ type: 'browse-folder' });

    state.clearPendingSelectionAction();
    expect(state.getPendingSelectionAction()).toBeNull();
  });
});

