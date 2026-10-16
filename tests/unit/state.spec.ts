// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AppSessionState } from '../../src/app/app-session-state.js';

describe('app state', () => {
  test('starts without an open folder', () => {
    const state = new AppSessionState();
    expect(state.currentFolderSession).toBeNull();
  });

  test('records the open folder session', () => {
    const state = new AppSessionState();

    state.setCurrentFolderSession({ folderPath: 'C:/clips' });

    expect(state.currentFolderSession).toEqual({ folderPath: 'C:/clips' });
  });
});
