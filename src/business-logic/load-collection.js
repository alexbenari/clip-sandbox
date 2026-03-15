import { createCollectionFromClipNames } from '../domain/clip-collection.js';

function normalizedCollectionName(name, fallback = '') {
  const trimmed = (name || '').trim();
  return trimmed || fallback;
}

function collectionNameFromFilename(filename) {
  return normalizedCollectionName((filename || '').replace(/\.txt$/i, ''));
}

function analyzeCollectionEntries(lines, folderClipNames) {
  const requestedNames = (lines || []).map((s) => s.trim()).filter(Boolean);
  const folderNames = Array.from(folderClipNames || []);

  if (requestedNames.length === 0) {
    return { kind: 'invalid-empty', requestedNames };
  }

  const counts = new Map();
  for (const name of requestedNames) counts.set(name, (counts.get(name) || 0) + 1);
  const duplicateNames = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => `${name} (x${count})`);
  if (duplicateNames.length > 0) {
    return { kind: 'invalid-duplicates', requestedNames, duplicateNames };
  }

  const folderSet = new Set(folderNames);
  const requestedSet = new Set(requestedNames);
  const missingNames = requestedNames.filter((name) => !folderSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => folderSet.has(name));

  if (missingNames.length > 0) {
    return {
      kind: 'has-missing',
      requestedNames,
      existingNamesInOrder,
      missingNames,
      missingCount: missingNames.length,
    };
  }

  const isExactMatch = requestedSet.size === folderNames.length && folderNames.every((name) => requestedSet.has(name));
  return {
    kind: isExactMatch ? 'exact-match' : 'subset-match',
    requestedNames,
    existingNamesInOrder: requestedNames.slice(),
  };
}

export function runLoadCollection({
  lines,
  file,
  folderClips = [],
  folderClipNames = [],
  currentCollectionName = '',
} = {}) {
  const analysis = analyzeCollectionEntries(lines, folderClipNames);
  const collectionName = normalizedCollectionName(
    collectionNameFromFilename(file?.name),
    currentCollectionName
  );

  if (analysis.kind === 'invalid-empty' || analysis.kind === 'invalid-duplicates') {
    return { ...analysis, collectionName };
  }

  if (analysis.kind === 'has-missing') {
    return {
      ...analysis,
      collectionName,
      partialCollection: createCollectionFromClipNames({
        name: collectionName,
        orderedNames: analysis.existingNamesInOrder,
        clips: folderClips,
      }),
    };
  }

  return {
    kind: 'loaded',
    matchKind: analysis.kind,
    collectionName,
    requestedNames: analysis.requestedNames,
    collection: createCollectionFromClipNames({
      name: collectionName,
      orderedNames: analysis.requestedNames,
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
