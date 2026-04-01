import { ClipCollection } from '../domain/clip-collection.js';
import { Clip } from '../domain/clip.js';

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

export function isTopLevelFolderEntry(file) {
  const relPath = String(file?.webkitRelativePath || '').trim();
  if (!relPath) return true;
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2;
}

export function topLevelFiles(files) {
  return Array.from(files || []).filter(isTopLevelFolderEntry);
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

function normalizedCollectionName(name, fallback = '') {
  const trimmed = (name || '').trim();
  return trimmed || fallback;
}

export function runLoadClips({
  fileList,
  collectionName = '',
  defaultCollectionName = '',
  nextClipId,
} = {}) {
  const files = filterAndSortFiles(fileList);
  const clips = files.map((file) => new Clip({ id: nextClipId(), file }));
  const collection = new ClipCollection({
    name: clips.length > 0 ? normalizedCollectionName(collectionName, defaultCollectionName) : '',
    clips,
  });
  return {
    files,
    clips,
    collection,
    count: clips.length,
  };
}

