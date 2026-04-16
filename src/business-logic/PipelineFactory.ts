// @ts-nocheck
import { Pipeline } from '../domain/pipeline.js';

const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);
const COLLECTION_FILE_EXT = '.txt';

export class PipelineFactory {
  isTopLevelFolderEntry(file) {
    const relPath = String(file?.webkitRelativePath || file?.relativePath || '').trim();
    if (!relPath) return true;
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length <= 2;
  }

  topLevelFiles(files) {
    return Array.from(files || []).filter((file) => this.isTopLevelFolderEntry(file));
  }

  isVideoFile(file) {
    if (file?.type && file.type.startsWith('video/')) return true;
    const name = file?.name || '';
    const ext = name.split('.').pop().toLowerCase();
    return VIDEO_EXTS.has(ext);
  }

  isCollectionFile(file) {
    return (file?.name || '').toLowerCase().endsWith(COLLECTION_FILE_EXT);
  }

  filterAndSortFiles(files) {
    return this.topLevelFiles(files)
      .filter((file) => this.isVideoFile(file))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  getVideosAndCollectionFiles(files) {
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
  } = {}) {
    const { videos, collectionFiles } = this.getVideosAndCollectionFiles(files);
    const validCollections = [];
    const invalidDescriptions = [];

    for (const file of collectionFiles) {
      const result = await validator.parseFile(file);
      if (result.ok) {
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
