import { runSaveOrder } from '../business-logic/save-order.js';
import { ClipCollectionContent } from '../domain/clip-collection-content.js';
import { validateCollectionName } from '../business-logic/collection-name.js';

function defaultNoop() {}

export class CollectionManager {
  #saveTextToDirectory;
  #downloadText;

  constructor({
    saveTextToDirectory,
    downloadText,
  } = {}) {
    this.#saveTextToDirectory = saveTextToDirectory;
    this.#downloadText = downloadText;
  }

  addDestinationChoices(inventory, sourceSelectionValue = inventory?.activeSelectionValue?.()) {
    if (!inventory) return [];
    return inventory.eligibleDestinationCollections(sourceSelectionValue).map((collectionContent) => ({
      label: collectionContent.collectionName,
      selectionValue: inventory.selectionValueFor(collectionContent),
      isDefault: collectionContent.isDefault,
      isNew: false,
    }));
  }

  async addSelectedClipsToCollection({
    selectedClipIds = [],
    sourceSelectionValue = '',
    destination = {},
    currentCollection,
    inventory,
    currentDirHandle = null,
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
      sourceSelectionValue,
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
      const saveMode = await runSaveOrder({
        names: persistableContent.orderedClipNames,
        currentDirHandle,
        saveTextToDirectory: this.#saveTextToDirectory,
        downloadText: this.#downloadText,
        showStatus: defaultNoop,
        filename: persistableContent.filename,
        buildSavedStatus: defaultNoop,
        buildDownloadedStatus: defaultNoop,
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

  #resolveDestination({ destination, inventory, sourceSelectionValue }) {
    if (destination?.kind === 'existing') {
      const selectionValue = String(destination.selectionValue || '').trim();
      if (!selectionValue || selectionValue === sourceSelectionValue) {
        return { ok: false, code: 'invalid-destination' };
      }
      const collectionContent = inventory.getCollectionBySelectionValue(selectionValue);
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
      if (validation.filename === sourceSelectionValue) {
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
}
