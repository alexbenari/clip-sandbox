import type { Clip } from '../domain/clip.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { RenamedCollectionChange } from '../domain/pipeline.js';
import type { CollectionFileWriter } from './collection-file-writer.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

export type FailedCollectionRename = Readonly<{ filename: string; collectionName: string; error: unknown }>;

export type ClipFileReplacementResult = Readonly<{ clip: Clip; failedCollections: readonly FailedCollectionRename[] }>;

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
}>;

export class ClipFileReplacement {
  constructor(private readonly deps: ClipFileReplacementDependencies) {}

  async replace(originalClip: Clip, replacement: ClipSource): Promise<ClipFileReplacementResult | null> {
    const { pipelineWorkingCopy, sourceMovies, zoom } = this.deps;
    const replaced = pipelineWorkingCopy.replaceClipFile(originalClip, replacement);
    if (!replaced) return null;
    const failedCollections = await this.rewriteCollections(replaced.changedCollections);
    this.showReplacedClip(replaced.clip);
    void sourceMovies.readClip(replaced.clip);
    zoom.openClip(replaced.clip);
    return Object.freeze({ clip: replaced.clip, failedCollections });
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
}
