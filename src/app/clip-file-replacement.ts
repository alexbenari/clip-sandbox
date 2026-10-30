import type { Clip } from '../domain/clip.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { RenamedCollectionChange } from '../domain/pipeline.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppText } from './app-text.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

type FailedCollectionRename = Readonly<{ filename: string; collectionName: string; error: unknown }>;

export interface IReplacedClipSourceMovie {
  readClip(clip: Clip): Promise<void>;
}

export interface IReplacedClipZoom {
  openClip(clip: Clip): boolean;
}

type ClipFileReplacementDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'replaceClipFile' | 'restoreSavedCollection'>;
  fileWriter: Pick<CollectionFileWriter, 'write'>;
  grid: { invalidateAllViews(): void; setSelectedClipId(clipId: string): void };
  collectionView: Pick<CollectionViewWorkflow, 'renderActiveSequence' | 'refreshSelector' | 'refreshToolbar'>;
  sourceMovies: IReplacedClipSourceMovie;
  zoom: IReplacedClipZoom;
  reporter: Pick<ActivityReporter, 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'collectionsNotRenamedText' | 'collectionsNotRenamedRecoveryText'>;
}>;

export class ClipFileReplacement {
  constructor(private readonly deps: ClipFileReplacementDependencies) {}

  async replace(originalClip: Clip, replacement: ClipSource): Promise<Clip | null> {
    const clip = await this.apply(originalClip, replacement);
    if (clip) this.deps.zoom.openClip(clip);
    return clip;
  }

  rename(clip: Clip, renamed: ClipSource): Promise<Clip | null> {
    return this.apply(clip, renamed);
  }

  private async apply(originalClip: Clip, replacement: ClipSource): Promise<Clip | null> {
    const { pipelineWorkingCopy, sourceMovies } = this.deps;
    const previousName = originalClip.name;
    const replaced = pipelineWorkingCopy.replaceClipFile(originalClip, replacement);
    if (!replaced) return null;
    const failedCollections = await this.rewriteCollections(replaced.changedCollections);
    this.showReplacedClip(replaced.clip);
    void sourceMovies.readClip(replaced.clip);
    if (failedCollections.length > 0) this.reportCollectionsNotRenamed(previousName, replacement.name, failedCollections);
    return replaced.clip;
  }

  // A collection file that could not be rewritten keeps the old name in memory too, so its view shows unsaved changes.
  private async rewriteCollections(changes: readonly RenamedCollectionChange[]): Promise<FailedCollectionRename[]> {
    const failed: FailedCollectionRename[] = [];
    for (const change of changes) {
      try {
        await this.deps.fileWriter.write(change.collection);
      } catch (error) {
        this.deps.pipelineWorkingCopy.restoreSavedCollection(change.previousCollection);
        failed.push(Object.freeze({ filename: change.filename, collectionName: change.collectionName, error }));
      }
    }
    return failed;
  }

  // Every cached view holds the previous file's picture, so all of them are built again.
  private showReplacedClip(clip: Clip): void {
    const { grid, collectionView } = this.deps;
    grid.invalidateAllViews();
    collectionView.renderActiveSequence();
    collectionView.refreshSelector();
    collectionView.refreshToolbar();
    grid.setSelectedClipId(clip.id);
  }

  private reportCollectionsNotRenamed(previousFilename: string, filename: string, failed: readonly FailedCollectionRename[]): void {
    const { reporter, appText } = this.deps;
    reporter.failure(appText.collectionsNotRenamedText(previousFilename, filename, failed.length), {
      affected: failed.map(({ collectionName }) => collectionName).join(', '),
      recovery: appText.collectionsNotRenamedRecoveryText(filename),
      technicalDetails: failed.map(({ collectionName, filename: collectionFile, error }) =>
        `${collectionName} (${collectionFile}): ${reporter.technicalDetailsOf(error)}`).join('\n'),
    });
  }
}
