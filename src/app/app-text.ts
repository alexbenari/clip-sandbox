type VideoEditFailure = {
  actionLabel?: string;
  code?: string;
};

type DeleteFromDiskResult = {
  deletedCount?: number;
  failedDeleteCount?: number;
  cleanedSavedCollectionCount?: number;
  failedCollectionRewriteCount?: number;
};

export class AppText {
  readonly defaultAppTitle = 'Clip Sandbox';

  constructor(
    private readonly formatNumber: (value: number) => string = value => new Intl.NumberFormat().format(value)
  ) {}

  niceNum(value: number): string {
    return this.formatNumber(value);
  }

  countText(count: number): string {
    return count === 1 ? '1 clip' : `${this.niceNum(count)} clips`;
  }

  loadedVideosText(count: number): string {
    return `Loaded pipeline with ${count} clip${count === 1 ? '' : 's'}.`;
  }

  fullscreenSlotsText(slots: number): string {
    return `Fullscreen slots: ${slots} (showing ${Math.max(0, slots - 1)})`;
  }

  collectionLoadedText(count: number): string {
    return `Loaded collection with ${count} clip${count === 1 ? '' : 's'}.`;
  }

  collectionPartiallyLoadedText(count: number, missingCount: number): string {
    return `Loaded ${count} clip${count === 1 ? '' : 's'} from the collection. Skipped ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}.`;
  }

  collectionReadErrorText(error: unknown): string {
    return `Failed to read collection file: ${this.errorDetail(error)}`;
  }

  collectionConflictSummaryText(existingCount: number, missingCount: number): string {
    return `The collection lists ${missingCount} missing entr${missingCount === 1 ? 'y' : 'ies'}. ${existingCount} clip${existingCount === 1 ? '' : 's'} from the collection still exist in the current pipeline.`;
  }

  collectionConflictListText(missingNames: string[]): string {
    return missingNames.join('\n');
  }

  noCollectionMatchesText(missingCount: number): string {
    return `None of the ${missingCount} missing collection entr${missingCount === 1 ? 'y matches' : 'ies match'} clips in the current pipeline.`;
  }

  saveAsNewNameRequiredText(): string {
    return 'Enter a collection name.';
  }

  saveAsNewInvalidNameText(): string {
    return 'Collection names cannot contain any of these characters: < > : " / \\ | ? *';
  }

  collectionAlreadyExistsText(): string {
    return 'A collection with that name already exists.';
  }

  savedCollectionFileText(filename: string): string {
    return `Saved ${filename} to the current pipeline folder.`;
  }

  downloadedCollectionFileText(filename: string): string {
    return `Downloaded ${filename}.`;
  }

  removedClipsText(count: number): string {
    return count === 1 ? 'Clip removed from view.' : `Removed ${count} clips from view.`;
  }

  addedSelectedClipsText(destinationName: string, addedCount: number, skippedCount = 0): string {
    if (addedCount === 0) {
      return `No clips were added to ${destinationName}. All ${skippedCount} selected clip${skippedCount === 1 ? ' is' : 's are'} already present.`;
    }
    if (skippedCount > 0) {
      return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}. Skipped ${skippedCount} already present.`;
    }
    return `Added ${addedCount} clip${addedCount === 1 ? '' : 's'} to ${destinationName}.`;
  }

  addSelectedClipsFailedText(destinationName: string, error: unknown): string {
    const detail = this.errorDetail(error) || 'Unknown error.';
    return `Failed to add selected clips to ${destinationName || 'the destination collection'}: ${detail}`;
  }

  videoEditStartedText(actionLabel: string, sourceName: string): string {
    return `${actionLabel} started for ${sourceName}.`;
  }

  videoEditSucceededText(outputName: string): string {
    return `Created ${outputName}.`;
  }

  videoEditPartialSuccessText(outputName: string): string {
    return `Created ${outputName}, but the current collection view could not be updated. Reopen the collection.`;
  }

  videoEditFailedText({ actionLabel = 'Edit', code = 'edit-failed' }: VideoEditFailure = {}): string {
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

  deleteFromDiskPreflightText(): string {
    return 'The current view has unsaved changes. Save before deleting clips from disk?';
  }

  deleteFromDiskConfirmationText(clipCount: number, affectedSavedCollectionCount = 0): string {
    const clipText = `${clipCount} clip${clipCount === 1 ? '' : 's'}`;
    if (affectedSavedCollectionCount === 0) {
      return `Delete ${clipText} from disk? This does not affect any saved collections in this pipeline.`;
    }
    return `Delete ${clipText} from disk? This also removes them from ${affectedSavedCollectionCount} saved collection${affectedSavedCollectionCount === 1 ? '' : 's'} in this pipeline.`;
  }

  deleteFromDiskPreviewOverflowText(hiddenCount: number): string {
    return `...and ${hiddenCount} more`;
  }

  deleteFromDiskResultText({
    deletedCount = 0,
    failedDeleteCount = 0,
    cleanedSavedCollectionCount = 0,
    failedCollectionRewriteCount = 0,
  }: DeleteFromDiskResult = {}): string {
    if (deletedCount === 0) return 'Failed to delete the selected clips from disk.';

    const parts = [`Deleted ${deletedCount} clip${deletedCount === 1 ? '' : 's'} from disk.`];
    if (failedDeleteCount > 0) parts.push(`Failed to delete ${failedDeleteCount}.`);
    if (cleanedSavedCollectionCount > 0) {
      parts.push(`Removed deleted clips from ${cleanedSavedCollectionCount} saved collection${cleanedSavedCollectionCount === 1 ? '' : 's'}.`);
    }
    if (failedCollectionRewriteCount > 0) {
      parts.push(`Failed to update ${failedCollectionRewriteCount} saved collection${failedCollectionRewriteCount === 1 ? '' : 's'}.`);
    }
    return parts.join(' ');
  }

  activeCollectionText(name: string): string {
    return (name || '').trim() || 'No pipeline loaded';
  }

  activeCollectionTabText(name: string): string {
    return (name || '').trim() || this.defaultAppTitle;
  }

  private errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error || '');
  }
}
