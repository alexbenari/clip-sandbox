import { ClipSequence } from './clip-sequence.js';
import { Clip } from './clip.js';
import { createCollectionSourceId } from './source-id.js';

function toFileMap(availableVideoFiles) {
  if (availableVideoFiles instanceof Map) return new Map(availableVideoFiles);
  return new Map(Array.from(availableVideoFiles || []).map((file) => [file.name, file]));
}

function materializedClips(names, filesByName, nextClipId) {
  return Array.from(names || [])
    .map((name) => filesByName.get(name))
    .filter(Boolean)
    .map((file) => new Clip({ id: nextClipId(), file, mediaSource: file?.mediaSource || '' }));
}

function requestedNameAnalysis(collection, availableNames = []) {
  const requestedNames = collection?.orderedClipNames || [];
  const normalizedAvailableNames = Array.from(availableNames || []);
  const availableSet = new Set(normalizedAvailableNames);
  const requestedSet = new Set(requestedNames);
  const missingNames = requestedNames.filter((name) => !availableSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => availableSet.has(name));
  const isExactMatch = requestedSet.size === normalizedAvailableNames.length
    && normalizedAvailableNames.every((name) => requestedSet.has(name));

  return {
    collection,
    collectionName: collection?.collectionName || '',
    requestedNames,
    existingNamesInOrder,
    missingNames,
    missingCount: missingNames.length,
    matchKind: isExactMatch ? 'exact-match' : 'subset-match',
  };
}

export class Collection {
  static ILLEGAL_COLLECTION_NAME_CHARS = /[<>:"/\\|?*]/;
  #collectionName;
  #filename;
  #orderedClipNames;

  constructor({
    collectionName = '',
    filename = null,
    orderedClipNames = [],
  } = {}) {
    this.#filename = Collection.#normalizedFilename(filename);
    this.#collectionName = Collection.#normalizedText(collectionName)
      || Collection.#collectionNameFromFilename(this.#filename);
    this.#orderedClipNames = Collection.#normalizedOrderedClipNames(orderedClipNames);
  }

  static fromFilename({ filename = '', orderedClipNames = [] } = {}) {
    return new Collection({
      filename,
      orderedClipNames,
    });
  }

  static filenameFromCollectionName(collectionName) {
    const trimmed = Collection.#normalizedText(collectionName);
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.txt') ? trimmed : `${trimmed}.txt`;
  }

  static validateCollectionName(name) {
    const trimmed = Collection.#normalizedText(name);
    if (!trimmed) {
      return {
        ok: false,
        code: 'required',
        name: '',
        filename: '',
      };
    }
    if (Collection.ILLEGAL_COLLECTION_NAME_CHARS.test(trimmed)) {
      return {
        ok: false,
        code: 'illegal-chars',
        name: trimmed,
        filename: '',
      };
    }
    return {
      ok: true,
      code: '',
      name: trimmed,
      filename: Collection.filenameFromCollectionName(trimmed),
    };
  }

  get collectionName() {
    return this.#collectionName;
  }

  get filename() {
    return this.#filename;
  }

  get orderedClipNames() {
    return this.#orderedClipNames.slice();
  }

  get hasBackingFile() {
    return !!this.#filename;
  }

  sourceId() {
    return createCollectionSourceId(this.#filename);
  }

  displayLabel() {
    return this.#collectionName;
  }

  baselineClipNames() {
    return this.orderedClipNames;
  }

  existingSaveFilename() {
    return this.#filename || '';
  }

  withOrderedClipNames(orderedClipNames) {
    return new Collection({
      collectionName: this.#collectionName,
      filename: this.#filename,
      orderedClipNames,
    });
  }

  withFilename(filename) {
    return new Collection({
      collectionName: this.#collectionName,
      filename,
      orderedClipNames: this.#orderedClipNames,
    });
  }

  appendMissingClipNames(orderedClipNames) {
    const existingNames = this.orderedClipNames;
    const seenNames = new Set(existingNames);
    const addedClipNames = [];
    const skippedClipNames = [];

    for (const clipName of Collection.#normalizedOrderedClipNames(orderedClipNames)) {
      if (seenNames.has(clipName)) {
        skippedClipNames.push(clipName);
        continue;
      }
      seenNames.add(clipName);
      addedClipNames.push(clipName);
    }

    const nextOrderedClipNames = existingNames.concat(addedClipNames);
    return {
      collection: this.withOrderedClipNames(nextOrderedClipNames),
      addedClipNames,
      skippedClipNames,
      addedCount: addedClipNames.length,
      skippedCount: skippedClipNames.length,
      isNoOp: addedClipNames.length === 0,
    };
  }

  withoutClipNames(clipNames) {
    const namesToRemove = new Set(Collection.#normalizedOrderedClipNames(clipNames));
    const removedClipNames = [];
    const remainingClipNames = [];

    for (const clipName of this.#orderedClipNames) {
      if (namesToRemove.has(clipName)) {
        removedClipNames.push(clipName);
        continue;
      }
      remainingClipNames.push(clipName);
    }

    return {
      collection: this.withOrderedClipNames(remainingClipNames),
      removedClipNames,
      removedCount: removedClipNames.length,
      isNoOp: removedClipNames.length === 0,
    };
  }

  toCollection({ filename = this.#filename } = {}) {
    return this.withFilename(filename);
  }

  materializeClipSequence({
    availableVideoFiles = [],
    nextClipId,
  } = {}) {
    const filesByName = toFileMap(availableVideoFiles);
    const analysis = requestedNameAnalysis(this, filesByName.keys());
    const partialSequence = new ClipSequence({
      name: analysis.collectionName,
      clips: materializedClips(analysis.existingNamesInOrder, filesByName, nextClipId),
    });

    if (analysis.missingNames.length > 0) {
      return {
        kind: 'has-missing',
        ...analysis,
        partialSequence,
        partialCollection: partialSequence,
      };
    }

    return {
      kind: 'loaded',
      ...analysis,
      sequence: partialSequence,
      collection: partialSequence,
    };
  }

  toText() {
    if (this.#orderedClipNames.length === 0) return '';
    return this.#orderedClipNames.join('\n') + '\n';
  }

  static #normalizedText(value) {
    return String(value || '').trim();
  }

  static #normalizedFilename(filename) {
    const trimmed = Collection.#normalizedText(filename);
    return trimmed ? Collection.filenameFromCollectionName(trimmed) : null;
  }

  static #collectionNameFromFilename(filename) {
    return Collection.#normalizedText((filename || '').replace(/\.txt$/i, ''));
  }

  static #normalizedOrderedClipNames(names) {
    return Array.from(names || [])
      .map((name) => Collection.#normalizedText(name))
      .filter(Boolean);
  }
}
