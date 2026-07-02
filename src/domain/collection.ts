import { ClipSequence } from './clip-sequence.js';
import { Clip } from './clip.js';
import type { ClipFile } from './clip.js';

export type CollectionNameValidationResult =
  | { ok: true; code: ''; name: string; filename: string }
  | { ok: false; code: 'required' | 'illegal-chars'; name: string; filename: string };

export type CollectionMutationResult = {
  collection: Collection;
  addedClipNames: string[];
  skippedClipNames: string[];
  addedCount: number;
  skippedCount: number;
  isNoOp: boolean;
};

export type CollectionRemovalResult = {
  collection: Collection;
  removedClipNames: string[];
  removedCount: number;
  isNoOp: boolean;
};

type RequestedNameAnalysis = {
  collectionName: string;
  requestedNames: string[];
  existingNamesInOrder: string[];
  missingNames: string[];
  missingCount: number;
  matchKind: 'exact-match' | 'subset-match';
};

export type CollectionMaterialization =
  | (RequestedNameAnalysis & {
    kind: 'loaded';
    collection: ClipSequence;
    sequence: ClipSequence;
  })
  | (RequestedNameAnalysis & {
    kind: 'has-missing';
    collection: Collection;
    partialCollection: ClipSequence;
    partialSequence: ClipSequence;
  });

type CollectionParams = {
  collectionName?: string;
  filename?: string | null;
  orderedClipNames?: Iterable<string>;
};

function toFileMap(availableVideoFiles: ReadonlyArray<ClipFile> | Map<string, ClipFile>): Map<string, ClipFile> {
  if (availableVideoFiles instanceof Map) return new Map(availableVideoFiles);
  return new Map(Array.from(availableVideoFiles || []).map((file) => [file.name, file]));
}

function toClipMap(availableClips: ReadonlyArray<Clip> | Map<string, Clip>): Map<string, Clip> {
  if (availableClips instanceof Map) return new Map(availableClips);
  return new Map(Array.from(availableClips || []).map((clip) => [clip.name, clip]));
}

function materializedClips(names: Iterable<string>, clipsByName: Map<string, Clip>): Clip[] {
  return Array.from(names || []).flatMap((name) => {
    const clip = clipsByName.get(name);
    return clip ? [clip] : [];
  });
}

function requestedNameAnalysis(collection: Collection, availableNames: Iterable<string> = []): RequestedNameAnalysis {
  const requestedNames = collection.orderedClipNames;
  const normalizedAvailableNames = Array.from(availableNames || []);
  const availableSet = new Set(normalizedAvailableNames);
  const requestedSet = new Set(requestedNames);
  const missingNames = requestedNames.filter((name) => !availableSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => availableSet.has(name));
  const isExactMatch = requestedSet.size === normalizedAvailableNames.length
    && normalizedAvailableNames.every((name) => requestedSet.has(name));

  return {
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
  static WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  #collectionName: string;
  #filename: string | null;
  #orderedClipNames: string[];

  constructor({
    collectionName = '',
    filename = null,
    orderedClipNames = [],
  }: CollectionParams = {}) {
    this.#filename = Collection.#normalizedFilename(filename);
    this.#collectionName = Collection.#normalizedText(collectionName)
      || Collection.#collectionNameFromFilename(this.#filename);
    this.#orderedClipNames = Collection.#normalizedOrderedClipNames(orderedClipNames);
  }

  static fromFilename({ filename = '', orderedClipNames = [] }: { filename?: string; orderedClipNames?: Iterable<string> } = {}): Collection {
    return new Collection({
      filename,
      orderedClipNames,
    });
  }

  static filenameFromCollectionName(collectionName: string): string {
    const trimmed = Collection.#normalizedText(collectionName);
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.txt') ? trimmed : `${trimmed}.txt`;
  }

  static identityKeyFromFilename(filename: string | null | undefined): string {
    const normalizedFilename = Collection.#normalizedFilename(filename);
    return normalizedFilename ? normalizedFilename.toLowerCase() : '';
  }

  static validateCollectionName(name: string): CollectionNameValidationResult {
    const trimmed = Collection.#normalizedText(name);
    if (!trimmed) {
      return {
        ok: false,
        code: 'required',
        name: '',
        filename: '',
      };
    }
    if (
      Collection.ILLEGAL_COLLECTION_NAME_CHARS.test(trimmed)
      || Collection.#hasWindowsInvalidFilenameShape(trimmed)
    ) {
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

  displayLabel(): string {
    return this.#collectionName;
  }

  withOrderedClipNames(orderedClipNames: Iterable<string>): Collection {
    return new Collection({
      collectionName: this.#collectionName,
      filename: this.#filename,
      orderedClipNames,
    });
  }

  withFilename(filename: string | null | undefined): Collection {
    return new Collection({
      collectionName: this.#collectionName,
      filename,
      orderedClipNames: this.#orderedClipNames,
    });
  }

  appendMissingClipNames(orderedClipNames: Iterable<string>): CollectionMutationResult {
    const existingNames = this.orderedClipNames;
    const seenNames = new Set(existingNames);
    const addedClipNames: string[] = [];
    const skippedClipNames: string[] = [];

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

  addClips(clipNames: Iterable<string>): CollectionMutationResult {
    return this.appendMissingClipNames(clipNames);
  }

  withoutClipNames(clipNames: Iterable<string>): CollectionRemovalResult {
    const namesToRemove = new Set(Collection.#normalizedOrderedClipNames(clipNames));
    const removedClipNames: string[] = [];
    const remainingClipNames: string[] = [];

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

  removeVideos(videoNames: Iterable<string>): CollectionRemovalResult {
    return this.withoutClipNames(videoNames);
  }

  toCollection({ filename = this.#filename }: { filename?: string | null } = {}): Collection {
    return this.withFilename(filename);
  }

  materializeClipSequence({
    availableVideoFiles = [],
    availableClips = null,
    nextClipId,
  }: {
    availableVideoFiles?: ReadonlyArray<ClipFile> | Map<string, ClipFile>;
    availableClips?: ReadonlyArray<Clip> | Map<string, Clip> | null;
    nextClipId?: () => string;
  } = {}): CollectionMaterialization {
    if (!availableClips && typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to materialize a collection sequence.');
    }
    const clipsByName = availableClips
      ? toClipMap(availableClips)
      : new Map(Array.from(toFileMap(availableVideoFiles).values()).map((file) => [
        file.name,
        new Clip({ id: nextClipId!(), file, mediaSource: file.mediaSource || '' }),
      ]));
    const analysis = requestedNameAnalysis(this, clipsByName.keys());
    const partialSequence = new ClipSequence({
      name: analysis.collectionName,
      clips: materializedClips(analysis.existingNamesInOrder, clipsByName),
    });

    if (analysis.missingNames.length > 0) {
      return {
        kind: 'has-missing',
        ...analysis,
        collection: this,
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

  toText(): string {
    if (this.#orderedClipNames.length === 0) return '';
    return this.#orderedClipNames.join('\n') + '\n';
  }

  static #normalizedText(value: unknown): string {
    return String(value || '').trim();
  }

  static #normalizedFilename(filename: string | null | undefined): string | null {
    const trimmed = Collection.#normalizedText(filename);
    return trimmed ? Collection.filenameFromCollectionName(trimmed) : null;
  }

  static #collectionNameFromFilename(filename: string | null | undefined): string {
    return Collection.#normalizedText((filename || '').replace(/\.txt$/i, ''));
  }

  static #normalizedOrderedClipNames(names: Iterable<string>): string[] {
    return Array.from(names || [])
      .map((name) => Collection.#normalizedText(name))
      .filter(Boolean);
  }

  static #hasWindowsInvalidFilenameShape(name: string): boolean {
    if (!name || name === '.' || name === '..') return true;
    if (/[. ]$/.test(name)) return true;
    const basenamePrefix = name.split('.')[0] || '';
    return /[. ]$/.test(basenamePrefix) || Collection.WINDOWS_RESERVED_BASENAME.test(basenamePrefix);
  }
}

