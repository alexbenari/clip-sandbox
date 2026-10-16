// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AppSessionState } from '../../src/app/app-session-state.js';

describe('app state', () => {
  test('starts without an open folder', () => {
    const state = new AppSessionState();
    expect(state.currentFolderAccess).toBeNull();
  });

  test('records access to the open folder', () => {
    const state = new AppSessionState();

    state.setCurrentFolderAccess({ folderPath: 'C:/clips' });

    expect(state.currentFolderAccess).toEqual({ folderPath: 'C:/clips' });
  });
});
