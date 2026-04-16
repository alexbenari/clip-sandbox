// @ts-nocheck
export const DEFAULT_APP_TITLE = 'Local Video Grid Reviewer';

export function niceNum(n) {
  return new Intl.NumberFormat().format(n);
}

export function countText(count, niceNum) {
  return count === 1 ? '1 clip' : `${niceNum(count)} clips`;
}

export function loadedVideosText(count) {
  return `Loaded pipeline with ${count} clip${count === 1 ? '' : 's'}.`;
}

export function fullscreenSlotsText(slots) {
  return `Fullscreen slots: ${slots} (showing ${Math.max(0, slots - 1)})`;
}

export function collectionLoadedText(count) {
  return `Loaded collection with ${count} clip${count === 1 ? '' : 's'}.`;
}

export function collectionPartiallyLoadedText(count, missingCount) {
  return `Loaded ${count} clip${count === 1 ? '' : 's'} from the collection. Skipped ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}.`;
}

export function collectionReadErrorText(err) {
  return 'Failed to read collection file: ' + (err?.message || err);
}

export function collectionConflictSummaryText(existingCount, missingCount) {
  return `The collection lists ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}. ${existingCount} clip${existingCount === 1 ? '' : 's'} from the collection still exist in the current pipeline.`;
}

export function collectionConflictListText(missingNames) {
  return missingNames.join('\n');
}

export function noCollectionMatchesText(missingCount) {
  return `None of the ${missingCount} missing collection entr${missingCount === 1 ? 'y matches' : 'ies match'} clips in the current pipeline.`;
}

export function saveAsNewNameRequiredText() {
  return 'Enter a collection name.';
}

export function saveAsNewInvalidNameText() {
  return 'Collection names cannot contain any of these characters: < > : " / \\ | ? *';
}

export function collectionAlreadyExistsText() {
  return 'A collection with that name already exists.';
}

export function savedCollectionFileText(filename) {
  return `Saved ${filename} to the current pipeline folder.`;
}

export function downloadedCollectionFileText(filename) {
  return `Downloaded ${filename}.`;
}

export function removedClipsText(count) {
  return count === 1 ? 'Clip removed from view.' : `Removed ${count} clips from view.`;
}

export function addedSelectedClipsText(destinationName, addedCount, skippedCount = 0) {
  if (addedCount === 0) {
    return `No clips were added to ${destinationName}. All ${skippedCount} selected clip${skippedCount === 1 ? ' is' : 's are'} already present.`;
  }
  if (skippedCount > 0) {
    return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}. Skipped ${skippedCount} already present.`;
  }
  return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}.`;
}

export function addSelectedClipsFailedText(destinationName, err) {
  const detail = err?.message || err || 'Unknown error.';
  return `Failed to add selected clips to ${destinationName || 'the destination collection'}: ${detail}`;
}

export function deleteFromDiskPreflightText() {
  return 'The current view has unsaved changes. Save before deleting clips from disk?';
}

export function deleteFromDiskConfirmationText(clipCount, affectedSavedCollectionCount = 0) {
  const clipText = `${clipCount} clip${clipCount === 1 ? '' : 's'}`;
  if (affectedSavedCollectionCount === 0) {
    return `Delete ${clipText} from disk? This does not affect any saved collections in this pipeline.`;
  }
  return `Delete ${clipText} from disk? This also removes them from ${affectedSavedCollectionCount} saved collection${affectedSavedCollectionCount === 1 ? '' : 's'} in this pipeline.`;
}

export function deleteFromDiskPreviewOverflowText(hiddenCount) {
  return `...and ${hiddenCount} more`;
}

export function deleteFromDiskResultText({
  deletedCount = 0,
  failedDeleteCount = 0,
  cleanedSavedCollectionCount = 0,
  failedCollectionRewriteCount = 0,
} = {}) {
  if (deletedCount === 0) {
    return 'Failed to delete the selected clips from disk.';
  }

  const parts = [`Deleted ${deletedCount} clip${deletedCount === 1 ? '' : 's'} from disk.`];
  if (failedDeleteCount > 0) {
    parts.push(`Failed to delete ${failedDeleteCount}.`);
  }
  if (cleanedSavedCollectionCount > 0) {
    parts.push(`Removed deleted clips from ${cleanedSavedCollectionCount} saved collection${cleanedSavedCollectionCount === 1 ? '' : 's'}.`);
  }
  if (failedCollectionRewriteCount > 0) {
    parts.push(`Failed to update ${failedCollectionRewriteCount} saved collection${failedCollectionRewriteCount === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}

export function activeCollectionText(name) {
  return (name || '').trim() || DEFAULT_APP_TITLE;
}

export function activeCollectionTabText(name) {
  const trimmed = (name || '').trim();
  return trimmed || DEFAULT_APP_TITLE;
}

