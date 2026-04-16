// @ts-nocheck
import { ClipSequence } from './clip-sequence.js';
import { Clip } from './clip.js';

/**
 * @param {ReadonlyArray<import('./clip.js').ClipFile> | Map<string, import('./clip.js').ClipFile>} availableVideoFiles
 * @returns {Map<string, import('./clip.js').ClipFile>}
 */
function toFileMap(availableVideoFiles) {
  if (availableVideoFiles instanceof Map) return new Map(availableVideoFiles);
  return new Map(Array.from(availableVideoFiles || []).map((file) => [file.name, file]));
}

/**
 * @param {Iterable<string>} names
 * @param {Map<string, import('./clip.js').ClipFile>} filesByName
 * @param {() => string} nextClipId
 * @returns {Clip[]}
 */
function materializedClips(names, filesByName, nextClipId) {
  return Array.from(names || []).flatMap((name) => {
    const file = filesByName.get(name);
    return file ? [new Clip({ id: nextClipId(), file, mediaSource: file.mediaSource || '' })] : [];
  });
}

/**
 * @param {Collection} collection
 * @param {Iterable<string>} [availableNames=[]]
 * @returns {{
 *   collection: Collection,
 *   collectionName: string,
 *   requestedNames: string[],
 *   existingNamesInOrder: string[],
 *   missingNames: string[],
 *   missingCount: number,
 *   matchKind: 'exact-match' | 'subset-match'
 * }}
 */
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

  /**
   * @param {{ collectionName?: string, filename?: string | null, orderedClipNames?: Iterable<string> }} [params]
   */
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

  /**
   * @param {{ filename?: string, orderedClipNames?: Iterable<string> }} [params]
   * @returns {Collection}
   */
  static fromFilename({ filename = '', orderedClipNames = [] } = {}) {
    return new Collection({
      filename,
      orderedClipNames,
    });
  }

  /**
   * @param {string} collectionName
   * @returns {string}
   */
  static filenameFromCollectionName(collectionName) {
    const trimmed = Collection.#normalizedText(collectionName);
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.txt') ? trimmed : `${trimmed}.txt`;
  }

  /**
   * @param {string} name
   * @returns {{ ok: true, code: '', name: string, filename: string } | { ok: false, code: 'required' | 'illegal-chars', name: string, filename: string }}
   */
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

  /** @returns {string} */
  displayLabel() {
    return this.#collectionName;
  }

  /**
   * @param {Iterable<string>} orderedClipNames
   * @returns {Collection}
   */
  withOrderedClipNames(orderedClipNames) {
    return new Collection({
      collectionName: this.#collectionName,
      filename: this.#filename,
      orderedClipNames,
    });
  }

  /**
   * @param {string | null | undefined} filename
   * @returns {Collection}
   */
  withFilename(filename) {
    return new Collection({
      collectionName: this.#collectionName,
      filename,
      orderedClipNames: this.#orderedClipNames,
    });
  }

  /**
   * @param {Iterable<string>} orderedClipNames
   * @returns {{ collection: Collection, addedClipNames: string[], skippedClipNames: string[], addedCount: number, skippedCount: number, isNoOp: boolean }}
   */
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

  /**
   * @param {Iterable<string>} clipNames
   * @returns {{ collection: Collection, addedClipNames: string[], skippedClipNames: string[], addedCount: number, skippedCount: number, isNoOp: boolean }}
   */
  addClips(clipNames) {
    return this.appendMissingClipNames(clipNames);
  }

  /**
   * @param {Iterable<string>} clipNames
   * @returns {{ collection: Collection, removedClipNames: string[], removedCount: number, isNoOp: boolean }}
   */
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

  /**
   * @param {Iterable<string>} videoNames
   * @returns {{ collection: Collection, removedClipNames: string[], removedCount: number, isNoOp: boolean }}
   */
  removeVideos(videoNames) {
    return this.withoutClipNames(videoNames);
  }

  /**
   * @param {{ filename?: string | null }} [options]
   * @returns {Collection}
   */
  toCollection({ filename = this.#filename } = {}) {
    return this.withFilename(filename);
  }

  /**
   * @param {{ availableVideoFiles?: ReadonlyArray<import('./clip.js').ClipFile> | Map<string, import('./clip.js').ClipFile>, nextClipId?: () => string }} [options]
   * @returns {{
   *   kind: 'loaded',
   *   collection: ClipSequence,
   *   collectionName: string,
   *   existingNamesInOrder: string[],
   *   matchKind: 'exact-match' | 'subset-match',
   *   requestedNames: string[],
   *   sequence: ClipSequence,
   *   missingCount: number,
   *   missingNames: string[]
   * } | {
   *   kind: 'has-missing',
   *   collection: Collection,
   *   collectionName: string,
   *   existingNamesInOrder: string[],
   *   matchKind: 'exact-match' | 'subset-match',
   *   requestedNames: string[],
   *   partialCollection: ClipSequence,
   *   partialSequence: ClipSequence,
   *   missingCount: number,
   *   missingNames: string[]
   * }}
   */
  materializeClipSequence({
    availableVideoFiles = [],
    nextClipId,
  } = {}) {
    if (typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to materialize a collection sequence.');
    }
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

  /** @returns {string} */
  toText() {
    if (this.#orderedClipNames.length === 0) return '';
    return this.#orderedClipNames.join('\n') + '\n';
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  static #normalizedText(value) {
    return String(value || '').trim();
  }

  /**
   * @param {string | null | undefined} filename
   * @returns {string | null}
   */
  static #normalizedFilename(filename) {
    const trimmed = Collection.#normalizedText(filename);
    return trimmed ? Collection.filenameFromCollectionName(trimmed) : null;
  }

  /**
   * @param {string | null | undefined} filename
   * @returns {string}
   */
  static #collectionNameFromFilename(filename) {
    return Collection.#normalizedText((filename || '').replace(/\.txt$/i, ''));
  }

  /**
   * @param {Iterable<string>} names
   * @returns {string[]}
   */
  static #normalizedOrderedClipNames(names) {
    return Array.from(names || [])
      .map((name) => Collection.#normalizedText(name))
      .filter(Boolean);
  }
}

