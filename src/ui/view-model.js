export const DEFAULT_APP_TITLE = 'Local Video Grid Reviewer';
export const DEFAULT_ACTIVE_COLLECTION_NAME = 'All Clips';

export function countText(count, niceNum) {
  return count === 1 ? '1 clip' : `${niceNum(count)} clips`;
}

export function loadedVideosText(count) {
  return `Loaded ${count} video${count === 1 ? '' : 's'}.`;
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

export function collectionEmptyErrorText() {
  return 'Could not load collection: the file is empty.';
}

export function collectionDuplicateErrorText(duplicateNames) {
  return `Could not load collection: duplicate entries were found. ${duplicateNames.join(', ')}`;
}

export function collectionReadErrorText(err) {
  return 'Failed to read collection file: ' + (err?.message || err);
}

export function collectionFirstUnavailableText() {
  return 'Load the folder first, then load the collection file.';
}

export function collectionConflictSummaryText(existingCount, missingCount) {
  return `The collection lists ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}. ${existingCount} clip${existingCount === 1 ? '' : 's'} from the collection still exist in the selected folder.`;
}

export function collectionConflictListText(missingNames) {
  return missingNames.join('\n');
}

export function noCollectionMatchesText(missingCount) {
  return `None of the ${missingCount} missing collection entr${missingCount === 1 ? 'y matches' : 'ies match'} files in the selected folder.`;
}

export function saveAsNewNameRequiredText() {
  return 'Enter a collection name.';
}

export function saveAsNewInvalidNameText() {
  return 'Collection names cannot contain any of these characters: < > : " / \\ | ? *';
}

export function saveAsNewHeadingText() {
  return 'Save current collection as a new file';
}

export function saveAsNewHelpText() {
  return 'Enter a file name. The app will add .txt automatically.';
}

export function savedCollectionFileText(filename) {
  return `Saved ${filename} to the selected folder.`;
}

export function downloadedCollectionFileText(filename) {
  return `Downloaded ${filename}.`;
}

export function activeCollectionText(name) {
  return (name || '').trim() || DEFAULT_APP_TITLE;
}

export function activeCollectionTabText(name) {
  const trimmed = (name || '').trim();
  return trimmed ? `${trimmed} collection` : DEFAULT_APP_TITLE;
}
