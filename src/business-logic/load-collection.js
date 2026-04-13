import { ClipCollection } from '../domain/clip-collection.js';
import { Clip } from '../domain/clip.js';

function requestedNameAnalysis(content, availableNames = []) {
  const requestedNames = content?.orderedClipNames || [];
  const normalizedAvailableNames = Array.from(availableNames || []);
  const availableSet = new Set(normalizedAvailableNames);
  const requestedSet = new Set(requestedNames);
  const missingNames = requestedNames.filter((name) => !availableSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => availableSet.has(name));
  const isExactMatch = requestedSet.size === normalizedAvailableNames.length
    && normalizedAvailableNames.every((name) => requestedSet.has(name));

  return {
    content,
    collectionName: content?.collectionName || '',
    requestedNames,
    existingNamesInOrder,
    missingNames,
    missingCount: missingNames.length,
    matchKind: isExactMatch ? 'exact-match' : 'subset-match',
  };
}

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
  const analysis = requestedNameAnalysis(content, filesByName.keys());
  const partialCollection = new ClipCollection({
    name: analysis.collectionName,
    clips: materializedClips(analysis.existingNamesInOrder, filesByName, nextClipId),
  });

  if (analysis.missingNames.length > 0) {
    return {
      kind: 'has-missing',
      ...analysis,
      partialCollection,
    };
  }

  return {
    kind: 'loaded',
    ...analysis,
    collection: partialCollection,
  };
}
