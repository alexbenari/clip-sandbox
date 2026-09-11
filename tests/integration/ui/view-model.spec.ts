// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AppText } from '../../../src/app/app-text.js';

describe('AppText', () => {
  const appText = new AppText(value => String(value));

  test('formats count text', () => {
    expect(appText.countText(1)).toBe('1 clip');
    expect(appText.countText(12)).toBe('12 clips');
  });

  test('formats status messages', () => {
    expect(appText.loadedVideosText(1)).toBe('Loaded pipeline with 1 clip.');
    expect(appText.loadedVideosText(3)).toBe('Loaded pipeline with 3 clips.');
    expect(appText.fullscreenSlotsText(6)).toBe('Fullscreen slots: 6 (showing 5)');
    expect(appText.collectionLoadedText(2)).toBe('Loaded collection with 2 clips.');
    expect(appText.collectionPartiallyLoadedText(1, 2)).toContain('Skipped 2 missing entries.');
    expect(appText.savedCollectionFileText('my-cut.txt')).toBe('Saved my-cut.txt to the current pipeline folder.');
    expect(appText.downloadedCollectionFileText('my-cut.txt')).toBe('Downloaded my-cut.txt.');
    expect(appText.removedClipsText(1)).toBe('Clip removed from view.');
    expect(appText.removedClipsText(3)).toBe('Removed 3 clips from view.');
    expect(appText.deleteFromDiskPreflightText()).toContain('Save before deleting');
    expect(appText.deleteFromDiskConfirmationText(3, 0)).toContain('does not affect any saved collections');
    expect(appText.deleteFromDiskConfirmationText(3, 2)).toContain('2 saved collections');
    expect(appText.deleteFromDiskPreviewOverflowText(4)).toBe('...and 4 more');
    expect(appText.deleteFromDiskResultText({ deletedCount: 3, cleanedSavedCollectionCount: 2 })).toBe(
      'Deleted 3 clips from disk. Removed deleted clips from 2 saved collections.'
    );
    expect(appText.deleteFromDiskResultText({ deletedCount: 3, failedDeleteCount: 1, failedCollectionRewriteCount: 1 })).toBe(
      'Deleted 3 clips from disk. Failed to delete 1. Failed to update 1 saved collection.'
    );
  });

  test('formats collection conflict and validation text', () => {
    expect(appText.collectionConflictSummaryText(2, 1)).toContain('1 missing entry');
    expect(appText.saveAsNewNameRequiredText()).toContain('Enter');
    expect(appText.saveAsNewInvalidNameText()).toContain('< > :');
  });

  test('formats active source text for app and tab', () => {
    expect(appText.activeCollectionText('subset')).toBe('subset');
    expect(appText.activeCollectionText('')).toBe('No pipeline loaded');
    expect(appText.activeCollectionTabText('subset')).toBe('subset');
    expect(appText.activeCollectionTabText('')).toBe('Clip Sandbox');
  });
});

