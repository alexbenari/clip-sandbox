import { Collection } from '../domain/collection.js';
import { normalizeSourceId, sourceIdsEqual } from '../domain/source-id.js';
import { persistCollectionContent } from './persist-collection-content.js';

export class CollectionManager {
  #fileSystem;

  constructor({
    fileSystem,
  } = {}) {
    this.#fileSystem = fileSystem;
  }

  async addSelectedClipsToCollection({
    selectedClipIds = [],
    sourceId = null,
    destination = {},
    currentClipSequence,
    pipeline,
    currentFolderSession = null,
  } = {}) {
    if (!pipeline || !currentClipSequence) {
      return { ok: false, code: 'missing-context' };
    }

    const selectedClipNames = currentClipSequence.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) {
      return { ok: false, code: 'no-selection' };
    }

    const destinationResolution = this.#resolveDestination({
      destination,
      pipeline,
      sourceId,
    });
    if (!destinationResolution.ok) return destinationResolution;

    const merged = destinationResolution.collection.appendMissingClipNames(selectedClipNames);
    if (merged.isNoOp) {
      return {
        ok: true,
        code: 'no-op',
        destinationName: destinationResolution.collection.collectionName,
        addedCount: 0,
        skippedCount: merged.skippedCount,
        saveMode: null,
      };
    }

    const persistableCollection = merged.collection.withFilename(destinationResolution.filename);
    try {
      const { mode: saveMode } = await persistCollectionContent({
        fileSystem: this.#fileSystem,
        content: persistableCollection,
        currentFolderSession,
        pipeline,
      });
      return {
        ok: true,
        code: 'added',
        destinationName: persistableCollection.collectionName,
        addedCount: merged.addedCount,
        skippedCount: merged.skippedCount,
        saveMode,
        collection: persistableCollection,
      };
    } catch (error) {
      return {
        ok: false,
        code: 'save-failed',
        error,
        destinationName: persistableCollection.collectionName,
      };
    }
  }

  #resolveDestination({ destination, pipeline, sourceId }) {
    if (destination?.kind === 'existing') {
      const destinationSourceId = normalizeSourceId(destination.sourceId || destination.collectionRef);
      if (!destinationSourceId || destinationSourceId.kind !== 'collection' || sourceIdsEqual(destinationSourceId, sourceId)) {
        return { ok: false, code: 'invalid-destination' };
      }
      const collection = pipeline.resolveSource(destinationSourceId);
      if (!collection) return { ok: false, code: 'invalid-destination' };
      return {
        ok: true,
        collection,
        filename: collection.filename,
      };
    }

    if (destination?.kind === 'new') {
      const validation = Collection.validateCollectionName(destination.name);
      if (!validation.ok) return { ok: false, code: validation.code };
      if (sourceId?.kind === 'collection' && validation.filename === sourceId.filename) {
        return { ok: false, code: 'invalid-destination' };
      }
      if (pipeline.getCollectionByFilename(validation.filename)) {
        return { ok: false, code: 'already-exists' };
      }
      return {
        ok: true,
        collection: Collection.fromFilename({
          filename: validation.filename,
          orderedClipNames: [],
        }),
        filename: validation.filename,
      };
    }

    return { ok: false, code: 'invalid-destination' };
  }
}
