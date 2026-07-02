export const DEFAULT_APP_TITLE = 'Local Video Grid Reviewer';

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err || '');
}

export function niceNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function countText(count: number, formatNumber: (value: number) => string): string {
  return count === 1 ? '1 clip' : `${formatNumber(count)} clips`;
}

export function loadedVideosText(count: number): string {
  return `Loaded pipeline with ${count} clip${count === 1 ? '' : 's'}.`;
}

export function fullscreenSlotsText(slots: number): string {
  return `Fullscreen slots: ${slots} (showing ${Math.max(0, slots - 1)})`;
}

export function collectionLoadedText(count: number): string {
  return `Loaded collection with ${count} clip${count === 1 ? '' : 's'}.`;
}

export function collectionPartiallyLoadedText(count: number, missingCount: number): string {
  return `Loaded ${count} clip${count === 1 ? '' : 's'} from the collection. Skipped ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}.`;
}

export function collectionReadErrorText(err: unknown): string {
  return 'Failed to read collection file: ' + errorDetail(err);
}

export function collectionConflictSummaryText(existingCount: number, missingCount: number): string {
  return `The collection lists ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}. ${existingCount} clip${existingCount === 1 ? '' : 's'} from the collection still exist in the current pipeline.`;
}

export function collectionConflictListText(missingNames: string[]): string {
  return missingNames.join('\n');
}

export function noCollectionMatchesText(missingCount: number): string {
  return `None of the ${missingCount} missing collection entr${missingCount === 1 ? 'y matches' : 'ies match'} clips in the current pipeline.`;
}

export function saveAsNewNameRequiredText(): string {
  return 'Enter a collection name.';
}

export function saveAsNewInvalidNameText(): string {
  return 'Collection names cannot contain any of these characters: < > : " / \\ | ? *';
}

export function collectionAlreadyExistsText(): string {
  return 'A collection with that name already exists.';
}

export function savedCollectionFileText(filename: string): string {
  return `Saved ${filename} to the current pipeline folder.`;
}

export function downloadedCollectionFileText(filename: string): string {
  return `Downloaded ${filename}.`;
}

export function removedClipsText(count: number): string {
  return count === 1 ? 'Clip removed from view.' : `Removed ${count} clips from view.`;
}

export function addedSelectedClipsText(destinationName: string, addedCount: number, skippedCount = 0): string {
  if (addedCount === 0) {
    return `No clips were added to ${destinationName}. All ${skippedCount} selected clip${skippedCount === 1 ? ' is' : 's are'} already present.`;
  }
  if (skippedCount > 0) {
    return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}. Skipped ${skippedCount} already present.`;
  }
  return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}.`;
}

export function addSelectedClipsFailedText(destinationName: string, err: unknown): string {
  const detail = errorDetail(err) || 'Unknown error.';
  return `Failed to add selected clips to ${destinationName || 'the destination collection'}: ${detail}`;
}

export function videoEditStartedText(actionLabel: string, sourceName: string): string {
  return `${actionLabel} started for ${sourceName}.`;
}

export function videoEditSucceededText(outputName: string): string {
  return `Created ${outputName}.`;
}

export function videoEditPartialSuccessText(outputName: string): string {
  return `Created ${outputName}, but the current collection view could not be updated. Reopen the collection.`;
}

export function videoEditFailedText({ actionLabel = 'Edit', code = 'edit-failed' }: { actionLabel?: string; code?: string } = {}): string {
  const failureTextByCode: Record<string, string> = {
    'invalid-edit': `${actionLabel} is unavailable in this build.`,
    'invalid-output': `${actionLabel} could not determine an output filename.`,
    'invalid-source-name': `${actionLabel} could not derive an output filename from the current clip.`,
    'missing-binary': `${actionLabel} is unavailable because ffmpeg is not configured.`,
    'missing-output-folder': `${actionLabel} is unavailable for the current folder.`,
    'missing-source': `${actionLabel} could not find the source clip on disk.`,
    'missing-source-path': `${actionLabel} is unavailable because the source clip path is missing.`,
    'output-missing': `${actionLabel} finished, but the output file was not found.`,
    'process-failed': `${actionLabel} failed while generating the output clip.`,
    'unsupported-edit': `${actionLabel} is not supported.`,
  };
  return failureTextByCode[code] || `${actionLabel} failed.`;
}

export function deleteFromDiskPreflightText(): string {
  return 'The current view has unsaved changes. Save before deleting clips from disk?';
}

export function deleteFromDiskConfirmationText(clipCount: number, affectedSavedCollectionCount = 0): string {
  const clipText = `${clipCount} clip${clipCount === 1 ? '' : 's'}`;
  if (affectedSavedCollectionCount === 0) {
    return `Delete ${clipText} from disk? This does not affect any saved collections in this pipeline.`;
  }
  return `Delete ${clipText} from disk? This also removes them from ${affectedSavedCollectionCount} saved collection${affectedSavedCollectionCount === 1 ? '' : 's'} in this pipeline.`;
}

export function deleteFromDiskPreviewOverflowText(hiddenCount: number): string {
  return `...and ${hiddenCount} more`;
}

export function deleteFromDiskResultText({
  deletedCount = 0,
  failedDeleteCount = 0,
  cleanedSavedCollectionCount = 0,
  failedCollectionRewriteCount = 0,
}: {
  deletedCount?: number;
  failedDeleteCount?: number;
  cleanedSavedCollectionCount?: number;
  failedCollectionRewriteCount?: number;
} = {}): string {
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

export function activeCollectionText(name: string): string {
  return (name || '').trim() || DEFAULT_APP_TITLE;
}

export function activeCollectionTabText(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed || DEFAULT_APP_TITLE;
}

