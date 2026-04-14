import { Clip } from './clip.js';
import { ClipSequence } from './clip-sequence.js';
import { Collection } from './collection.js';
import { createPipelineSourceId } from './source-id.js';

function sortedFiles(files) {
  return Array.from(files || []).sort((a, b) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

export class Pipeline {
  #folderName;
  #videoFilesByName;
  #collectionsByFilename;

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

  sourceId() {
    return createPipelineSourceId();
  }

  displayLabel() {
    return this.#folderName || 'Pipeline';
  }

  baselineClipNames() {
    return this.videoNames();
  }

  materializeClipSequence({ nextClipId } = {}) {
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

  setVideoFiles(videoFiles) {
    this.#videoFilesByName = new Map(
      sortedFiles(videoFiles).map((file) => [file.name, file])
    );
  }

  videoFiles() {
    return Array.from(this.#videoFilesByName.values());
  }

  videoFileMap() {
    return new Map(this.#videoFilesByName);
  }

  videoNames() {
    return Array.from(this.#videoFilesByName.keys());
  }

  setCollections(collections) {
    this.#collectionsByFilename = new Map();
    for (const collection of Array.from(collections || [])) {
      if (!(collection instanceof Collection) || !collection.hasBackingFile) continue;
      this.#collectionsByFilename.set(collection.filename, collection);
    }
  }

  upsertCollection(collection) {
    if (!(collection instanceof Collection) || !collection.hasBackingFile) return;
    this.#collectionsByFilename.set(collection.filename, collection);
  }

  collections() {
    return Array.from(this.#collectionsByFilename.values())
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName, undefined, { sensitivity: 'base', numeric: true }));
  }

  selectableSources() {
    return [this, ...this.collections()];
  }

  getCollectionByFilename(filename) {
    const normalizedFilename = String(filename || '').trim();
    return this.#collectionsByFilename.get(normalizedFilename) || null;
  }

  resolveSource(sourceId) {
    if (sourceId?.kind === 'pipeline') return this;
    if (sourceId?.kind === 'collection') return this.getCollectionByFilename(sourceId.filename);
    return null;
  }

  savedCollectionEntriesContainingClipNames(clipNames) {
    const names = new Set(Array.from(clipNames || []).filter(Boolean));
    if (names.size === 0) return [];
    return this.collections().filter((collection) =>
      collection.orderedClipNames.some((clipName) => names.has(clipName))
    ).map((collection) => ({
      collection,
      filename: collection.filename,
    }));
  }

  eligibleDestinationCollections(sourceId = this.sourceId()) {
    return this.collections().filter((collection) => {
      if (sourceId?.kind !== 'collection') return true;
      return collection.filename !== sourceId.filename;
    });
  }
}
