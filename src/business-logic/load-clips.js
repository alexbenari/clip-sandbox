import { createClipCollection } from '../domain/clip-collection.js';
import { createClip } from '../domain/clip-model.js';

export const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);

export function isVideoFile(file) {
  if (file?.type && file.type.startsWith('video/')) return true;
  const name = file?.name || '';
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXTS.has(ext);
}

export function filterAndSortFiles(files) {
  return Array.from(files || [])
    .filter(isVideoFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
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
  const clips = files.map((file) => createClip({ id: nextClipId(), file }));
  const collection = createClipCollection({
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
