import { ClipSequence } from './clip-sequence.js';
import type { Clip } from './clip.js';

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

export type CollectionRenameResult = {
  collection: Collection;
  isNoOp: boolean;
};

type RequestedNameAnalysis = {
  collectionName: string;
  existingNamesInOrder: string[];
  missingNames: string[];
  missingCount: number;
};

// 'loaded': every listed clip exists. 'has-missing': some listed clips are gone; partialSequence holds
// the ones that remain, in the collection's order.
export type CollectionMaterialization =
  | (RequestedNameAnalysis & { kind: 'loaded'; sequence: ClipSequence })
  | (RequestedNameAnalysis & { kind: 'has-missing'; partialSequence: ClipSequence });
type CollectionParams = {
  collectionName?: string;
  filename?: string | null;
  orderedClipNames?: Iterable<string>;
};

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

  // Extraction outputs are named <collection>-NNN.mp4. Existing entries keep their saved order;
  // only an earlier output published again after a retry moves ahead of later outputs.
  withExtractionOutput(filename: string): Collection {
    const names = this.orderedClipNames;
    if (names.includes(filename)) return this;
    const prefix = `${this.#collectionName}-`;
    const sequence = Collection.#outputSequence(filename, prefix);
    const laterOutputIndex = sequence === null ? -1 : names.findIndex(name => {
      const existingSequence = Collection.#outputSequence(name, prefix);
      return existingSequence !== null && existingSequence > sequence;
    });
    if (laterOutputIndex < 0) names.push(filename);
    else names.splice(laterOutputIndex, 0, filename);
    return this.withOrderedClipNames(names);
  }

  static #outputSequence(filename: string, prefix: string): number | null {
    if (!filename.toLowerCase().startsWith(prefix.toLowerCase()) || !/\.mp4$/i.test(filename)) return null;
    const sequenceText = filename.slice(prefix.length, -4);
    return /^\d+$/.test(sequenceText) ? Number(sequenceText) : null;
  }

  // Adds the clips this collection does not list yet, after its current clips.
  withClipsAdded(orderedClipNames: Iterable<string>): CollectionMutationResult {
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

  withoutClips(clipNames: Iterable<string>): CollectionRemovalResult {
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

  // A clip listed under both names keeps only its first place.
  withClipRenamed(previousName: string, nextName: string): CollectionRenameResult {
    const names = this.#orderedClipNames;
    if (!names.includes(previousName)) return { collection: this, isNoOp: true };
    const renamed = names.map(name => (name === previousName ? nextName : name));
    return { collection: this.withOrderedClipNames(new Set(renamed)), isNoOp: false };
  }

  // Matches the listed clip names against the clips that exist, keeping the collection's order.
  materializeClipSequence(availableClips: ReadonlyArray<Clip> | Map<string, Clip>): CollectionMaterialization {
    const clipsByName = Collection.#toClipMap(availableClips);
    const analysis = this.#requestedNameAnalysis(clipsByName.keys());
    const sequence = new ClipSequence({
      name: analysis.collectionName,
      clips: Collection.#materializedClips(analysis.existingNamesInOrder, clipsByName),
    });
    return analysis.missingNames.length > 0
      ? { kind: 'has-missing', ...analysis, partialSequence: sequence }
      : { kind: 'loaded', ...analysis, sequence };
  }
  static #normalizedText(value: unknown): string {
    return String(value || '').trim();
  }

  static #toClipMap(availableClips: ReadonlyArray<Clip> | Map<string, Clip>): Map<string, Clip> {
    if (availableClips instanceof Map) return new Map(availableClips);
    return new Map(Array.from(availableClips || []).map(clip => [clip.name, clip]));
  }

  static #materializedClips(names: Iterable<string>, clipsByName: Map<string, Clip>): Clip[] {
    return Array.from(names || []).flatMap(name => {
      const clip = clipsByName.get(name);
      return clip ? [clip] : [];
    });
  }

  #requestedNameAnalysis(availableNames: Iterable<string>): RequestedNameAnalysis {
    const requestedNames = this.orderedClipNames;
    const availableSet = new Set(availableNames);
    const missingNames = requestedNames.filter(name => !availableSet.has(name));
    return {
      collectionName: this.collectionName,
      existingNamesInOrder: requestedNames.filter(name => availableSet.has(name)),
      missingNames,
      missingCount: missingNames.length,
    };
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

