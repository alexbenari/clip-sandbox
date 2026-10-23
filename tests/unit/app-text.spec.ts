// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AppText } from '../../src/app/app-text.js';

describe('AppText', () => {
  const appText = new AppText(value => String(value));

  test('formats counts with thousands separators by default', () => {
    expect(new AppText().niceNum(1234)).toBe('1,234');
  });

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
  });

  test('asks to save before moving clips to the Recycle Bin', () => {
    expect(appText.trashClipsPreflightText()).toBe(
      'The current view has unsaved changes. Save before moving clips to the Recycle Bin?'
    );
  });

  test('confirms how many clips move to the Recycle Bin and which saved collections lose them', () => {
    expect(appText.trashClipsConfirmationText(3, 0)).toBe(
      'Move 3 clips to the Recycle Bin? This does not affect any saved collections in this pipeline.'
    );
    expect(appText.trashClipsConfirmationText(3, 2)).toBe(
      'Move 3 clips to the Recycle Bin? This also removes them from 2 saved collections in this pipeline.'
    );
    expect(appText.trashClipsConfirmationText(1, 1)).toBe(
      'Move 1 clip to the Recycle Bin? This also removes it from 1 saved collection in this pipeline.'
    );
  });

  test('counts the file names hidden from the Recycle Bin preview', () => {
    expect(appText.trashClipsPreviewOverflowText(4)).toBe('…and 4 more');
  });

  test('reports how many clips moved to the Recycle Bin and what could not be done', () => {
    expect(appText.trashClipsResultText({ trashedCount: 1, cleanedSavedCollectionCount: 1 })).toBe(
      'Moved 1 clip to the Recycle Bin. Removed it from 1 saved collection.'
    );
    expect(appText.trashClipsResultText({ trashedCount: 3, cleanedSavedCollectionCount: 2 })).toBe(
      'Moved 3 clips to the Recycle Bin. Removed them from 2 saved collections.'
    );
    expect(appText.trashClipsResultText({ trashedCount: 3, failedTrashCount: 1, failedCollectionRewriteCount: 1 })).toBe(
      'Moved 3 clips to the Recycle Bin. Could not move 1. Failed to update 1 saved collection.'
    );
    expect(appText.trashClipsResultText({ trashedCount: 0, failedTrashCount: 2 })).toBe(
      'Could not move the selected clips to the Recycle Bin.'
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

