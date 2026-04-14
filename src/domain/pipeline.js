import { Clip } from './clip.js';
import { ClipSequence } from './clip-sequence.js';
import { Collection } from './collection.js';
import { IClipSequenceSource } from './clip-sequence-source.js';

/**
 * @param {Iterable<import('./clip.js').ClipFile>} files
 * @returns {import('./clip.js').ClipFile[]}
 */
function sortedFiles(files) {
  return Array.from(files || []).sort((a, b) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

/** @implements {IClipSequenceSource} */
export class Pipeline {
  #folderName;
  #videoFilesByName;
  #collectionsByFilename;

  /** @returns {import('./source-id.js').PipelineSourceId} */
  static sourceIdValue() {
    return { kind: 'pipeline' };
  }

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

  /** @returns {import('./source-id.js').PipelineSourceId} */
  sourceId() {
    return Pipeline.sourceIdValue();
  }

  /** @returns {string} */
  displayLabel() {
    return this.#folderName || 'Pipeline';
  }

  /** @returns {string[]} */
  baselineClipNames() {
    return this.videoNames();
  }

  /**
   * @param {import('./clip-sequence-source.js').MaterializeClipSequenceOptions} [options]
   * @returns {import('./clip-sequence-source.js').LoadedClipSequenceResult}
   */
  materializeClipSequence({ nextClipId } = {}) {
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

  /** @returns {Collection[]} */
  collections() {
    return Array.from(this.#collectionsByFilename.values())
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName, undefined, { sensitivity: 'base', numeric: true }));
  }

  /** @returns {(Pipeline | Collection)[]} */
  selectableSources() {
    return [this, ...this.collections()];
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
   * @param {import('./source-id.js').SourceId | null | undefined} sourceId
   * @returns {Pipeline | Collection | null}
   */
  resolveSource(sourceId) {
    if (sourceId?.kind === 'pipeline') return this;
    if (sourceId?.kind === 'collection') return this.getCollectionByFilename(sourceId.filename);
    return null;
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
   * @param {import('./source-id.js').SourceId} [sourceId]
   * @returns {Collection[]}
   */
  eligibleDestinationCollections(sourceId = this.sourceId()) {
    return this.collections().filter((collection) => {
      if (sourceId?.kind !== 'collection') return true;
      return collection.filename !== sourceId.filename;
    });
  }
}
