import { ClipCollection } from '../domain/clip-collection.js';
import { Clip } from '../domain/clip.js';

function toFileMap(availableVideoFiles) {
  if (availableVideoFiles instanceof Map) return new Map(availableVideoFiles);
  return new Map(Array.from(availableVideoFiles || []).map((file) => [file.name, file]));
}

function materializedClips(names, filesByName, nextClipId) {
  return Array.from(names || [])
    .map((name) => filesByName.get(name))
    .filter(Boolean)
    .map((file) => new Clip({ id: nextClipId(), file }));
}

export function materializeCollectionContent({
  content,
  availableVideoFiles = [],
  nextClipId,
} = {}) {
  const filesByName = toFileMap(availableVideoFiles);
  const requestedNames = content?.orderedClipNames || [];
  const existingNamesInOrder = requestedNames.filter((name) => filesByName.has(name));
  const missingNames = requestedNames.filter((name) => !filesByName.has(name));
  const availableNames = Array.from(filesByName.keys());
  const requestedSet = new Set(requestedNames);
  const isExactMatch = requestedSet.size === availableNames.length
    && availableNames.every((name) => requestedSet.has(name));
  const partialCollection = new ClipCollection({
    name: content?.collectionName || '',
    clips: materializedClips(existingNamesInOrder, filesByName, nextClipId),
  });

  if (missingNames.length > 0) {
    return {
      kind: 'has-missing',
      content,
      collectionName: content?.collectionName || '',
      requestedNames,
      existingNamesInOrder,
      missingNames,
      missingCount: missingNames.length,
      partialCollection,
    };
  }

  return {
    kind: 'loaded',
    content,
    collectionName: content?.collectionName || '',
    requestedNames,
    matchKind: isExactMatch ? 'exact-match' : 'subset-match',
    collection: partialCollection,
  };
}
