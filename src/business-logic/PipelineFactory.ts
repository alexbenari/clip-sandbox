import { Pipeline } from '../domain/pipeline.js';
import type { ClipFile } from '../domain/clip.js';
import type { Collection } from '../domain/collection.js';
import type { CollectionDescriptionResult, CollectionDescriptionValidator, InvalidCollectionDescription } from '../domain/collection-description-validator.js';

const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);
const COLLECTION_FILE_EXT = '.txt';

type FolderEntryFile = ClipFile & {
  relativePath?: string;
  webkitRelativePath?: string;
};

export type PipelineBuildResult = {
  pipeline: Pipeline;
  videos: FolderEntryFile[];
  collectionFiles: FolderEntryFile[];
  validCollections: Collection[];
  invalidDescriptions: InvalidCollectionDescription[];
};

export class PipelineFactory {
  isTopLevelFolderEntry(file: FolderEntryFile): boolean {
    const relPath = String(file?.webkitRelativePath || file?.relativePath || '').trim();
    if (!relPath) return true;
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length <= 2;
  }

  topLevelFiles(files: Iterable<FolderEntryFile>): FolderEntryFile[] {
    return Array.from(files || []).filter((file) => this.isTopLevelFolderEntry(file));
  }

  isVideoFile(file: FolderEntryFile): boolean {
    if (file?.type && file.type.startsWith('video/')) return true;
    const name = file?.name || '';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTS.has(ext);
  }

  isCollectionFile(file: FolderEntryFile): boolean {
    return (file?.name || '').toLowerCase().endsWith(COLLECTION_FILE_EXT);
  }

  filterAndSortFiles(files: Iterable<FolderEntryFile>): FolderEntryFile[] {
    return this.topLevelFiles(files)
      .filter((file) => this.isVideoFile(file))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  getVideosAndCollectionFiles(files: Iterable<FolderEntryFile>): { videos: FolderEntryFile[]; collectionFiles: FolderEntryFile[] } {
    const entries = this.topLevelFiles(files);
    return {
      videos: entries
        .filter((file) => this.isVideoFile(file))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
      collectionFiles: entries
        .filter((file) => this.isCollectionFile(file))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    };
  }

  async buildPipeline({
    folderName = '',
    files = [],
    validator,
    logInvalidDescription,
  }: {
    folderName?: string;
    files?: Iterable<FolderEntryFile>;
    validator: Pick<CollectionDescriptionValidator, 'parseFile'>;
    logInvalidDescription?: (result: InvalidCollectionDescription) => void | Promise<void>;
  }): Promise<PipelineBuildResult> {
    const { videos, collectionFiles } = this.getVideosAndCollectionFiles(files);
    const validCollections: Collection[] = [];
    const invalidDescriptions: InvalidCollectionDescription[] = [];

    for (const file of collectionFiles) {
      const result: CollectionDescriptionResult = await validator.parseFile(file);
      if (result.ok === true) {
        validCollections.push(result.content);
        continue;
      }
      invalidDescriptions.push(result);
      await logInvalidDescription?.(result);
    }

    const pipeline = new Pipeline({
      folderName,
      videoFiles: videos,
      collections: validCollections,
    });

    return {
      pipeline,
      videos,
      collectionFiles,
      validCollections,
      invalidDescriptions,
    };
  }
}
