import { ClipSource } from '../domain/clip-source.js';
import { Pipeline } from '../domain/pipeline.js';
import type { Collection } from '../domain/collection.js';
import type { InvalidCollectionDescription } from '../domain/collection-description-validator.js';
import type { CollectionTextFormat } from './collection-text-format.js';
import type { FolderEntry } from './folder-entry.js';

const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);
const COLLECTION_FILE_EXT = '.txt';

export type PipelineBuildResult = {
  pipeline: Pipeline;
  videos: FolderEntry[];
  collectionFiles: FolderEntry[];
  validCollections: Collection[];
  invalidDescriptions: InvalidCollectionDescription[];
};

export class PipelineFactory {
  isVideoEntry(entry: FolderEntry): boolean {
    if (entry.type.startsWith('video/')) return true;
    const ext = entry.name.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTS.has(ext);
  }

  isCollectionEntry(entry: FolderEntry): boolean {
    return entry.name.toLowerCase().endsWith(COLLECTION_FILE_EXT);
  }

  getVideosAndCollectionFiles(entries: Iterable<FolderEntry>): { videos: FolderEntry[]; collectionFiles: FolderEntry[] } {
    const all = Array.from(entries || []);
    return {
      videos: PipelineFactory.sortedByName(all.filter((entry) => this.isVideoEntry(entry))),
      collectionFiles: PipelineFactory.sortedByName(all.filter((entry) => this.isCollectionEntry(entry))),
    };
  }

  async buildPipeline({
    folderName = '',
    files = [],
    collectionFormat,
    logInvalidDescription,
  }: {
    folderName?: string;
    files?: Iterable<FolderEntry>;
    collectionFormat: Pick<CollectionTextFormat, 'read'>;
    logInvalidDescription?: (result: InvalidCollectionDescription) => void | Promise<void>;
  }): Promise<PipelineBuildResult> {
    const { videos, collectionFiles } = this.getVideosAndCollectionFiles(files);
    const validCollections: Collection[] = [];
    const invalidDescriptions: InvalidCollectionDescription[] = [];

    for (const entry of collectionFiles) {
      const result = collectionFormat.read({ text: entry.text ?? '', filename: entry.name });
      if (result.ok === true) {
        validCollections.push(result.content);
        continue;
      }
      invalidDescriptions.push(result);
      await logInvalidDescription?.(result);
    }

    const pipeline = new Pipeline({
      folderName,
      videoSources: videos.map((entry) => ClipSource.create({
        name: entry.name,
        mediaSource: entry.mediaSource,
        desktopPath: entry.desktopPath,
      })),
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

  private static sortedByName(entries: FolderEntry[]): FolderEntry[] {
    return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
}
