import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { ClipCollection } from '../domain/clip-collection.js';
import { materializeCollectionContent } from './materialize-collection.js';

const defaultValidator = new CollectionDescriptionValidator();

export function runLoadCollection({
  lines,
  file,
  folderClips = [],
  folderClipNames = [],
  currentCollectionName = '',
} = {}) {
  const parsed = defaultValidator.parseLines({
    lines,
    filename: file?.name || currentCollectionName,
  });

  if (!parsed.ok) {
    return {
      kind: parsed.code,
      collectionName: parsed.filename?.replace(/\.txt$/i, '') || currentCollectionName,
      duplicateNames: parsed.duplicateNames || [],
    };
  }
  const requestedNames = parsed.content.orderedClipNames;
  const folderNames = Array.from(folderClipNames || []);
  const requestedSet = new Set(requestedNames);
  const folderSet = new Set(folderNames);
  const missingNames = requestedNames.filter((name) => !folderSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => folderSet.has(name));

  if (missingNames.length > 0) {
    return {
      kind: 'has-missing',
      content: parsed.content,
      collectionName: parsed.content.collectionName,
      requestedNames,
      existingNamesInOrder,
      missingNames,
      missingCount: missingNames.length,
      partialCollection: ClipCollection.fromClipNames({
        name: parsed.content.collectionName,
        orderedNames: existingNamesInOrder,
        clips: folderClips,
      }),
    };
  }

  const exact = requestedSet.size === folderNames.length
    && folderNames.every((name) => requestedSet.has(name));
  return {
    kind: 'loaded',
    content: parsed.content,
    collectionName: parsed.content.collectionName,
    requestedNames,
    matchKind: exact ? 'exact-match' : 'subset-match',
    collection: ClipCollection.fromClipNames({
      name: parsed.content.collectionName,
      orderedNames: requestedNames,
      clips: folderClips,
    }),
  };
}

export async function runLoadCollectionFromFile({
  file,
  folderClips = [],
  folderClipNames = [],
  currentCollectionName = '',
} = {}) {
  const text = await file.text();
  const lines = text.replace(/\r/g, '').split('\n');
  return runLoadCollection({
    lines,
    file,
    folderClips,
    folderClipNames,
    currentCollectionName,
  });
}

export { materializeCollectionContent };
