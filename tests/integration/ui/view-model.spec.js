import { describe, expect, test } from 'vitest';
import {
  countText,
  fullscreenSlotsText,
  loadedVideosText,
  collectionLoadedText,
  collectionPartiallyLoadedText,
  collectionEmptyErrorText,
  collectionDuplicateErrorText,
  collectionConflictSummaryText,
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  savedCollectionFileText,
  downloadedCollectionFileText,
  activeCollectionText,
  activeCollectionTabText,
} from '../../../src/app/app-text.js';

describe('app text helpers', () => {
  test('formats count text', () => {
    const niceNum = (n) => String(n);
    expect(countText(1, niceNum)).toBe('1 clip');
    expect(countText(12, niceNum)).toBe('12 clips');
  });

  test('formats status messages', () => {
    expect(loadedVideosText(1)).toBe('Loaded 1 video.');
    expect(loadedVideosText(3)).toBe('Loaded 3 videos.');
    expect(fullscreenSlotsText(6)).toBe('Fullscreen slots: 6 (showing 5)');
    expect(collectionLoadedText(2)).toBe('Loaded collection with 2 clips.');
    expect(collectionPartiallyLoadedText(1, 2)).toContain('Skipped 2 missing entries.');
    expect(savedCollectionFileText('my-cut.txt')).toBe('Saved my-cut.txt to the selected folder.');
    expect(downloadedCollectionFileText('my-cut.txt')).toBe('Downloaded my-cut.txt.');
  });

  test('formats collection errors and conflict summary', () => {
    expect(collectionEmptyErrorText()).toContain('empty');
    expect(collectionDuplicateErrorText(['a.mp4 (x2)'])).toContain('a.mp4');
    expect(collectionConflictSummaryText(2, 1)).toContain('1 missing entry');
    expect(saveAsNewNameRequiredText()).toContain('Enter');
    expect(saveAsNewInvalidNameText()).toContain('< > :');
  });

  test('formats active collection text for app and tab', () => {
    expect(activeCollectionText('subset')).toBe('subset');
    expect(activeCollectionText('')).toBe('Local Video Grid Reviewer');
    expect(activeCollectionTabText('subset')).toBe('subset collection');
    expect(activeCollectionTabText('')).toBe('Local Video Grid Reviewer');
  });
});
