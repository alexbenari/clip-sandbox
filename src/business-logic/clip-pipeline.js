import { persistCollectionContent } from './persist-collection-content.js';

export class ClipPipeline {
  #fileSystem;

  constructor({
    fileSystem,
  } = {}) {
    this.#fileSystem = fileSystem;
  }

  async deleteSelectedClipsFromDisk({
    selectedClipIds = [],
    currentClipSequence,
    pipeline,
    currentFolderSession = null,
  } = {}) {
    if (!pipeline || !currentClipSequence) {
      return { ok: false, code: 'missing-context' };
    }

    const selectedClips = currentClipSequence.clipsForIdsInOrder(selectedClipIds);
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
    const affectedCollections = pipeline.savedCollectionEntriesContainingClipNames(deletedClipNames);
    const failedCollectionRewrites = [];
    let cleanedSavedCollectionCount = 0;

    for (const entry of affectedCollections) {
      const pruned = entry.collection.withoutClipNames(deletedClipNames);
      if (pruned.isNoOp) continue;

      const persistableCollection = pruned.collection.withFilename(entry.filename);
      try {
        const { ok, mode: saveMode } = await persistCollectionContent({
          fileSystem: this.#fileSystem,
          content: persistableCollection,
          currentFolderSession,
          pipeline,
          requireDirectSave: true,
        });
        if (!ok || saveMode !== 'saved') {
          failedCollectionRewrites.push({
            filename: entry.filename,
            collectionName: entry.collection.collectionName,
            error: new Error(`Collection rewrite did not save directly for ${entry.filename}.`),
          });
          continue;
        }
        cleanedSavedCollectionCount += 1;
      } catch (error) {
        failedCollectionRewrites.push({
          filename: entry.filename,
          collectionName: entry.collection.collectionName,
          error,
        });
      }
    }

    if (deletedClipNames.length > 0) {
      const remainingFiles = pipeline.videoFiles().filter((file) => !deletedClipNameSet.has(file.name));
      pipeline.setVideoFiles(remainingFiles);
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
      targetedSavedCollectionCount: affectedCollections.length,
      cleanedSavedCollectionCount,
      failedCollectionRewrites,
    };
  }
}
