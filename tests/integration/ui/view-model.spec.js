import { describe, expect, test } from 'vitest';
import {
  countText,
  fullscreenSlotsText,
  loadedVideosText,
  collectionLoadedText,
  collectionPartiallyLoadedText,
  collectionConflictSummaryText,
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  savedCollectionFileText,
  downloadedCollectionFileText,
  removedClipsText,
  deleteFromDiskPreflightText,
  deleteFromDiskConfirmationText,
  deleteFromDiskPreviewOverflowText,
  deleteFromDiskResultText,
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
    expect(removedClipsText(1)).toBe('Clip removed from view.');
    expect(removedClipsText(3)).toBe('Removed 3 clips from view.');
    expect(deleteFromDiskPreflightText()).toContain('Save before deleting');
    expect(deleteFromDiskConfirmationText(3, 0)).toContain('does not affect any saved collections');
    expect(deleteFromDiskConfirmationText(3, 2)).toContain('2 saved collections');
    expect(deleteFromDiskPreviewOverflowText(4)).toBe('...and 4 more');
    expect(deleteFromDiskResultText({ deletedCount: 3, cleanedSavedCollectionCount: 2 })).toBe(
      'Deleted 3 clips from disk. Removed deleted clips from 2 saved collections.'
    );
    expect(deleteFromDiskResultText({ deletedCount: 3, failedDeleteCount: 1, failedCollectionRewriteCount: 1 })).toBe(
      'Deleted 3 clips from disk. Failed to delete 1. Failed to update 1 saved collection.'
    );
  });

  test('formats collection conflict and validation text', () => {
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
