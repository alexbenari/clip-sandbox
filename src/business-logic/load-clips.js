import { topLevelFiles } from '../adapters/browser/file-system-adapter.js';

export const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);
export const COLLECTION_FILE_EXT = '.txt';

export function isVideoFile(file) {
  if (file?.type && file.type.startsWith('video/')) return true;
  const name = file?.name || '';
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXTS.has(ext);
}

export function isCollectionFile(file) {
  return (file?.name || '').toLowerCase().endsWith(COLLECTION_FILE_EXT);
}

export function filterAndSortFiles(files) {
  return topLevelFiles(files)
    .filter(isVideoFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function getVideosAndCollectionFiles(files) {
  const entries = topLevelFiles(files);
  return {
    videos: entries
      .filter(isVideoFile)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    collectionFiles: entries
      .filter(isCollectionFile)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
  };
}
