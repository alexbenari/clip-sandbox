// @ts-nocheck
import { Clip } from './clip.js';
import { ClipSequence } from './clip-sequence.js';
import { Collection } from './collection.js';

/**
 * @param {Iterable<import('./clip.js').ClipFile>} files
 * @returns {import('./clip.js').ClipFile[]}
 */
function sortedFiles(files) {
  return Array.from(files || []).sort((a, b) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

export class Pipeline {
  #folderName;
  #videoFilesByName;
  #collectionsByFilename;

  /**
   * @param {{ folderName?: string, videoFiles?: Iterable<import('./clip.js').ClipFile>, collections?: Iterable<Collection> }} [params]
   */
  constructor({ folderName = '', videoFiles = [], collections = [] } = {}) {
    this.#folderName = String(folderName || '').trim();
    this.#videoFilesByName = new Map();
    this.#collectionsByFilename = new Map();
    this.setVideoFiles(videoFiles);
    this.setCollections(collections);
  }

  get folderName() {
    return this.#folderName;
  }

  /** @returns {string} */
  displayLabel() {
    return this.#folderName || 'Pipeline';
  }

  /**
   * @param {{ nextClipId?: () => string }} [options]
   * @returns {{ kind: 'loaded', sequence: ClipSequence }}
   */
  materializePipeline({ nextClipId } = {}) {
    if (typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to materialize a pipeline sequence.');
    }
    return {
      kind: 'loaded',
      sequence: new ClipSequence({
        name: this.displayLabel(),
        clips: this.videoFiles().map((file) => new Clip({
          id: nextClipId(),
          file,
          mediaSource: file?.mediaSource || '',
        })),
      }),
    };
  }

  /**
   * @param {Iterable<import('./clip.js').ClipFile>} videoFiles
   * @returns {void}
   */
  setVideoFiles(videoFiles) {
    this.#videoFilesByName = new Map(
      sortedFiles(videoFiles).map((file) => [file.name, file])
    );
  }

  /** @returns {import('./clip.js').ClipFile[]} */
  videoFiles() {
    return Array.from(this.#videoFilesByName.values());
  }

  /** @returns {Map<string, import('./clip.js').ClipFile>} */
  videoFileMap() {
    return new Map(this.#videoFilesByName);
  }

  /** @returns {string[]} */
  videoNames() {
    return Array.from(this.#videoFilesByName.keys());
  }

  /**
   * @param {Iterable<Collection>} collections
   * @returns {void}
   */
  setCollections(collections) {
    this.#collectionsByFilename = new Map();
    for (const collection of Array.from(collections || [])) {
      if (!(collection instanceof Collection) || !collection.hasBackingFile) continue;
      this.#collectionsByFilename.set(collection.filename, collection);
    }
  }

  /**
   * @param {Collection} collection
   * @returns {void}
   */
  upsertCollection(collection) {
    if (!(collection instanceof Collection) || !collection.hasBackingFile) return;
    this.#collectionsByFilename.set(collection.filename, collection);
  }

  /**
   * @param {string} filename
   * @returns {void}
   */
  removeCollection(filename) {
    const normalizedFilename = String(filename || '').trim();
    if (!normalizedFilename) return;
    this.#collectionsByFilename.delete(normalizedFilename);
  }

  /** @returns {Collection[]} */
  collections() {
    return Array.from(this.#collectionsByFilename.values())
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName, undefined, { sensitivity: 'base', numeric: true }));
  }

  /**
   * @param {string} filename
   * @returns {Collection | null}
   */
  getCollectionByFilename(filename) {
    const normalizedFilename = String(filename || '').trim();
    return this.#collectionsByFilename.get(normalizedFilename) || null;
  }

  /**
   * @param {{ collectionFilename?: string, clipNames?: Iterable<string> }} [params]
   * @returns {{
   *   ok: boolean,
   *   code: 'invalid-destination' | 'no-op' | 'added',
   *   collection?: Collection,
   *   previousCollection?: Collection | null,
   *   destinationName?: string,
   *   filename?: string,
   *   addedClipNames?: string[],
   *   skippedClipNames?: string[],
   *   addedCount?: number,
   *   skippedCount?: number,
   *   isNoOp?: boolean,
   *   created?: boolean,
   * }}
   */
  addClipsToCollection({
    collectionFilename = '',
    clipNames = [],
  } = {}) {
    const normalizedFilename = String(collectionFilename || '').trim();
    if (!normalizedFilename) {
      return { ok: false, code: 'invalid-destination' };
    }

    const previousCollection = this.getCollectionByFilename(normalizedFilename);
    const baseCollection = previousCollection || Collection.fromFilename({
      filename: normalizedFilename,
      orderedClipNames: [],
    });
    const merged = baseCollection.addClips(clipNames);

    if (merged.isNoOp && previousCollection) {
      return {
        ok: true,
        code: 'no-op',
        collection: previousCollection,
        previousCollection,
        destinationName: previousCollection.collectionName,
        filename: previousCollection.filename,
        addedClipNames: merged.addedClipNames,
        skippedClipNames: merged.skippedClipNames,
        addedCount: merged.addedCount,
        skippedCount: merged.skippedCount,
        isNoOp: true,
        created: false,
      };
    }

    const nextCollection = merged.collection.withFilename(normalizedFilename);
    this.upsertCollection(nextCollection);
    return {
      ok: true,
      code: 'added',
      collection: nextCollection,
      previousCollection,
      destinationName: nextCollection.collectionName,
      filename: nextCollection.filename,
      addedClipNames: merged.addedClipNames,
      skippedClipNames: merged.skippedClipNames,
      addedCount: merged.addedCount,
      skippedCount: merged.skippedCount,
      isNoOp: merged.isNoOp,
      created: !previousCollection,
    };
  }

  /**
   * @param {Collection | null | undefined} collection
   * @param {{ nextClipId?: () => string }} [options]
   * @returns {ReturnType<Collection['materializeClipSequence']> | null}
   */
  materializeCollection(collection, { nextClipId } = {}) {
    if (!(collection instanceof Collection) || typeof nextClipId !== 'function') return null;
    return collection.materializeClipSequence({
      availableVideoFiles: this.videoFiles(),
      nextClipId,
    });
  }

  /**
   * @param {Collection | null | undefined} collection
   * @param {{ nextClipId?: () => string }} [options]
   * @returns {{ selection: Pipeline | Collection, materialization: { kind: 'loaded', sequence: ClipSequence } | ReturnType<Collection['materializeClipSequence']> } | null}
   */
  materializeSelection(collection, { nextClipId } = {}) {
    const selection = collection instanceof Collection ? collection : this;
    const materialization = selection === this
      ? this.materializePipeline({ nextClipId })
      : this.materializeCollection(selection, { nextClipId });
    if (!materialization) return null;
    return {
      selection,
      materialization,
    };
  }

  /**
   * @param {Iterable<string>} videoNames
   * @returns {{
   *   removedVideoNames: string[],
   *   changedCollections: {
   *     filename: string,
   *     collectionName: string,
   *     previousCollection: Collection,
   *     collection: Collection,
   *     removedClipNames: string[],
   *     removedCount: number,
   *   }[],
   * }}
   */
  removeVideos(videoNames) {
    const namesToRemove = new Set(Array.from(videoNames || []).filter(Boolean));
    const removedVideoNames = this.videoNames().filter((name) => namesToRemove.has(name));

    if (removedVideoNames.length === 0) {
      return {
        removedVideoNames: [],
        changedCollections: [],
      };
    }

    const changedCollections = [];
    for (const collection of this.collections()) {
      const pruned = collection.removeVideos(removedVideoNames);
      if (pruned.isNoOp) continue;

      const nextCollection = pruned.collection.withFilename(collection.filename);
      this.upsertCollection(nextCollection);
      changedCollections.push({
        filename: collection.filename,
        collectionName: collection.collectionName,
        previousCollection: collection,
        collection: nextCollection,
        removedClipNames: pruned.removedClipNames,
        removedCount: pruned.removedCount,
      });
    }

    const removedNameSet = new Set(removedVideoNames);
    const remainingFiles = this.videoFiles().filter((file) => !removedNameSet.has(file.name));
    this.setVideoFiles(remainingFiles);

    return {
      removedVideoNames,
      changedCollections,
    };
  }

  /**
   * @param {Iterable<string>} clipNames
   * @returns {{ collection: Collection, filename: string }[]}
   */
  savedCollectionEntriesContainingClipNames(clipNames) {
    const names = new Set(Array.from(clipNames || []).filter(Boolean));
    if (names.size === 0) return [];
    return this.collections().filter((collection) =>
      collection.orderedClipNames.some((clipName) => names.has(clipName))
    ).map((collection) => ({
      collection,
      filename: /** @type {string} */ (collection.filename),
    }));
  }

  /**
   * @param {string | null | undefined} activeCollectionFilename
   * @returns {Collection[]}
   */
  eligibleDestinationCollections(activeCollectionFilename = null) {
    const normalizedActiveFilename = String(activeCollectionFilename || '').trim();
    return this.collections().filter((collection) => {
      if (!normalizedActiveFilename) return true;
      return collection.filename !== normalizedActiveFilename;
    });
  }
}

