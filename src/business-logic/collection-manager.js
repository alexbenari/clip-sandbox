import { persistCollectionContent } from './save-order.js';
import { ClipCollectionContent } from '../domain/clip-collection-content.js';
import { collectionRefsEqual, normalizeCollectionRef } from '../domain/collection-ref.js';
import { validateCollectionName } from './collection-name.js';

export class CollectionManager {
  #fileSystem;

  constructor({
    fileSystem,
  } = {}) {
    this.#fileSystem = fileSystem;
  }

  async addSelectedClipsToCollection({
    selectedClipIds = [],
    sourceCollectionRef = null,
    destination = {},
    currentCollection,
    inventory,
    currentFolderSession = null,
  } = {}) {
    if (!inventory || !currentCollection) {
      return { ok: false, code: 'missing-context' };
    }

    const selectedClipNames = currentCollection.clipNamesForIdsInOrder(selectedClipIds);
    if (selectedClipNames.length === 0) {
      return { ok: false, code: 'no-selection' };
    }

    const destinationResolution = this.#resolveDestination({
      destination,
      inventory,
      sourceCollectionRef,
    });
    if (!destinationResolution.ok) return destinationResolution;

    const merged = destinationResolution.collectionContent.appendMissingClipNames(selectedClipNames);
    if (merged.isNoOp) {
      return {
        ok: true,
        code: 'no-op',
        destinationName: destinationResolution.collectionContent.collectionName,
        addedCount: 0,
        skippedCount: merged.skippedCount,
        saveMode: null,
      };
    }

    const persistableContent = merged.content.withFilename(destinationResolution.filename);
    try {
      const { mode: saveMode } = await persistCollectionContent({
        content: persistableContent,
        folderSession: currentFolderSession,
        fileSystem: this.#fileSystem,
      });
      inventory.upsertCollectionContent(persistableContent, { makeActive: false });
      return {
        ok: true,
        code: 'added',
        destinationName: persistableContent.collectionName,
        addedCount: merged.addedCount,
        skippedCount: merged.skippedCount,
        saveMode,
        content: persistableContent,
      };
    } catch (error) {
      return {
        ok: false,
        code: 'save-failed',
        error,
        destinationName: persistableContent.collectionName,
      };
    }
  }

  #resolveDestination({ destination, inventory, sourceCollectionRef }) {
    if (destination?.kind === 'existing') {
      const destinationCollectionRef = normalizeCollectionRef(destination.collectionRef);
      if (!destinationCollectionRef || collectionRefsEqual(destinationCollectionRef, sourceCollectionRef)) {
        return { ok: false, code: 'invalid-destination' };
      }
      const collectionContent = inventory.getCollectionByRef(destinationCollectionRef);
      if (!collectionContent) return { ok: false, code: 'invalid-destination' };
      return {
        ok: true,
        collectionContent,
        filename: collectionContent.isDefault
          ? inventory.defaultCollectionFilename()
          : collectionContent.filename,
      };
    }

    if (destination?.kind === 'new') {
      const validation = validateCollectionName(destination.name);
      if (!validation.ok) return { ok: false, code: validation.code };
      if (sourceCollectionRef?.kind === 'saved' && validation.filename === sourceCollectionRef.filename) {
        return { ok: false, code: 'invalid-destination' };
      }
      if (inventory.getCollectionByFilename(validation.filename)) {
        return { ok: false, code: 'already-exists' };
      }
      return {
        ok: true,
        collectionContent: ClipCollectionContent.fromFilename({
          filename: validation.filename,
          orderedClipNames: [],
        }),
        filename: validation.filename,
      };
    }

    return { ok: false, code: 'invalid-destination' };
  }

  async deleteSelectedClipsFromDisk({
    selectedClipIds = [],
    currentCollection,
    inventory,
    currentFolderSession = null,
  } = {}) {
    if (!inventory || !currentCollection) {
      return { ok: false, code: 'missing-context' };
    }

    const selectedClips = currentCollection.clipsForIdsInOrder(selectedClipIds);
    if (selectedClips.length === 0) {
      return { ok: false, code: 'no-selection' };
    }

    const selectedClipNames = selectedClips.map((clip) => clip.name);
    const deleteResult = await this.#fileSystem.deleteFiles({
      folderSession: currentFolderSession,
      filenames: selectedClipNames,
    });
    if (deleteResult.code === 'unavailable') {
      return {
        ok: false,
        code: 'delete-unavailable',
        failedDeletes: deleteResult.results,
      };
    }

    const deletedClipNames = deleteResult.results
      .filter((result) => result.ok)
      .map((result) => result.filename);
    const deletedClipNameSet = new Set(deletedClipNames);
    const deletedClipIds = selectedClips
      .filter((clip) => deletedClipNameSet.has(clip.name))
      .map((clip) => clip.id);

    const failedDeletes = deleteResult.results.filter((result) => !result.ok);
    const affectedSavedCollections = inventory.savedCollectionEntriesContainingClipNames(deletedClipNames);
    const failedCollectionRewrites = [];
    let cleanedSavedCollectionCount = 0;

    for (const entry of affectedSavedCollections) {
      const pruned = entry.collectionContent.removeClipNames(deletedClipNames);
      if (pruned.isNoOp) continue;

      const persistableContent = pruned.content.withFilename(entry.filename);
      try {
        const { mode: saveMode } = await persistCollectionContent({
          content: persistableContent,
          folderSession: currentFolderSession,
          fileSystem: this.#fileSystem,
        });

        if (saveMode !== 'saved') {
          failedCollectionRewrites.push({
            filename: entry.filename,
            collectionName: entry.collectionContent.collectionName,
            error: new Error(`Collection rewrite did not save directly for ${entry.filename}.`),
          });
          continue;
        }

        inventory.upsertCollectionContent(persistableContent, { makeActive: false });
        cleanedSavedCollectionCount += 1;
      } catch (error) {
        failedCollectionRewrites.push({
          filename: entry.filename,
          collectionName: entry.collectionContent.collectionName,
          error,
        });
      }
    }

    if (deletedClipNames.length > 0) {
      const remainingFiles = inventory.videoFiles().filter((file) => !deletedClipNameSet.has(file.name));
      inventory.setVideoFiles(remainingFiles);
    }

    return {
      ok: deletedClipNames.length > 0 && failedDeletes.length === 0 && failedCollectionRewrites.length === 0,
      code: deletedClipNames.length === 0
        ? 'delete-failed'
        : (failedDeletes.length === 0 && failedCollectionRewrites.length === 0 ? 'deleted' : 'partial'),
      selectedClipIds: Array.from(selectedClipIds || []),
      selectedClipNames,
      deletedClipIds,
      deletedClipNames,
      failedDeletes,
      targetedSavedCollectionCount: affectedSavedCollections.length,
      cleanedSavedCollectionCount,
      failedCollectionRewrites,
    };
  }
}
