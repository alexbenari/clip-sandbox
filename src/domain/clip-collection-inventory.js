import { ClipCollectionContent } from './clip-collection-content.js';

export const DEFAULT_COLLECTION_SELECTION_VALUE = '__default__';

export class ClipCollectionInventory {
  #folderName;
  #videoFilesByName;
  #collectionsByFilename;
  #defaultCollection;
  #activeCollection;
  #dirty;
  #pendingAction;

  constructor({ folderName = '', videoFiles = [], collectionContents = [] } = {}) {
    this.#folderName = String(folderName || '').trim();
    this.#videoFilesByName = new Map();
    this.#collectionsByFilename = new Map();
    this.#defaultCollection = ClipCollectionContent.createDefault({ folderName: this.#folderName });
    this.#activeCollection = this.#defaultCollection;
    this.#dirty = false;
    this.#pendingAction = null;
    this.setVideoFiles(videoFiles);
    this.setCollectionContents(collectionContents);
  }

  get folderName() {
    return this.#folderName;
  }

  setVideoFiles(videoFiles) {
    this.#videoFilesByName = new Map(
      this.#sortedVideoFiles(videoFiles).map((file) => [file.name, file])
    );
    this.#refreshDefaultCollection();
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

  setCollectionContents(collectionContents) {
    const nextCollectionsByFilename = new Map();
    let nextDefaultCollection = this.#defaultCollection;
    for (const collectionContent of Array.from(collectionContents || [])) {
      if (!(collectionContent instanceof ClipCollectionContent)) continue;
      if (this.isDefaultCollectionFilename(collectionContent.filename)) {
        nextDefaultCollection = ClipCollectionContent.createDefault({
          folderName: this.#folderName,
          orderedClipNames: collectionContent.orderedClipNames,
        });
        continue;
      }
      if (!collectionContent.hasBackingFile) continue;
      nextCollectionsByFilename.set(collectionContent.filename, collectionContent);
    }
    this.#defaultCollection = nextDefaultCollection;
    this.#collectionsByFilename = nextCollectionsByFilename;
    if (!this.#activeCollection?.hasBackingFile
      || this.#activeCollection.collectionName === this.#defaultCollection.collectionName
      || !this.#collectionsByFilename.has(this.#activeCollection.filename)) {
      this.#activeCollection = this.#defaultCollection;
    } else {
      this.#activeCollection = this.#collectionsByFilename.get(this.#activeCollection.filename);
    }
  }

  upsertCollectionContent(collectionContent, { makeActive = false } = {}) {
    if (!(collectionContent instanceof ClipCollectionContent)) return;
    if (this.isDefaultCollectionFilename(collectionContent.filename)) {
      this.#defaultCollection = ClipCollectionContent.createDefault({
        folderName: this.#folderName,
        orderedClipNames: collectionContent.orderedClipNames,
      });
      if (makeActive) this.#activeCollection = this.#defaultCollection;
      return;
    }
    if (!collectionContent.hasBackingFile) return;
    this.#collectionsByFilename.set(collectionContent.filename, collectionContent);
    if (makeActive) this.#activeCollection = collectionContent;
  }

  defaultCollection() {
    return this.#defaultCollection;
  }

  activeCollection() {
    return this.#activeCollection || this.#defaultCollection;
  }

  setActiveCollection(collectionContent) {
    if (collectionContent?.isDefault) {
      this.#activeCollection = this.#defaultCollection;
      return this.#activeCollection;
    }
    if (!collectionContent?.hasBackingFile) return null;
    const nextCollection = this.#collectionsByFilename.get(collectionContent.filename);
    if (!nextCollection) return null;
    this.#activeCollection = nextCollection;
    return this.#activeCollection;
  }

  getCollectionByFilename(filename) {
    const normalizedFilename = String(filename || '').trim();
    if (this.isDefaultCollectionFilename(normalizedFilename)) return this.#defaultCollection;
    return this.#collectionsByFilename.get(normalizedFilename) || null;
  }

  selectableCollections() {
    const explicitCollections = Array.from(this.#collectionsByFilename.values())
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName, undefined, { sensitivity: 'base', numeric: true }));
    return [this.#defaultCollection, ...explicitCollections];
  }

  selectionValueFor(collectionContent) {
    return collectionContent?.hasBackingFile ? collectionContent.filename : DEFAULT_COLLECTION_SELECTION_VALUE;
  }

  getCollectionBySelectionValue(value) {
    return value === DEFAULT_COLLECTION_SELECTION_VALUE
      ? this.#defaultCollection
      : this.getCollectionByFilename(value);
  }

  defaultCollectionFilename() {
    return ClipCollectionContent.filenameFromCollectionName(this.#defaultCollection.collectionName);
  }

  isDefaultCollectionFilename(filename) {
    return String(filename || '').trim() === this.defaultCollectionFilename();
  }

  eligibleDestinationCollections(sourceSelectionValue = this.activeSelectionValue()) {
    return this.selectableCollections()
      .filter((collectionContent) => this.selectionValueFor(collectionContent) !== sourceSelectionValue);
  }

  activeSelectionValue() {
    return this.selectionValueFor(this.activeCollection());
  }

  hasDirtyChanges() {
    return this.#dirty;
  }

  refreshDirtyState(collection) {
    const baseline = this.activeCollection()?.orderedClipNames || [];
    const currentNames = collection?.clipNamesInOrder?.() || [];
    this.#dirty = currentNames.length !== baseline.length
      || currentNames.some((name, index) => name !== baseline[index]);
    return this.#dirty;
  }

  clearDirtyState() {
    this.#dirty = false;
  }

  setPendingAction(action) {
    this.#pendingAction = action || null;
  }

  pendingAction() {
    return this.#pendingAction;
  }

  clearPendingAction() {
    this.#pendingAction = null;
  }

  #refreshDefaultCollection() {
    const existingOrderedClipNames = this.#defaultCollection?.orderedClipNames?.length
      ? this.#defaultCollection.orderedClipNames
      : this.videoNames();
    this.#defaultCollection = ClipCollectionContent.createDefault({
      folderName: this.#folderName,
      orderedClipNames: existingOrderedClipNames,
    });
    if (!this.#activeCollection?.hasBackingFile) {
      this.#activeCollection = this.#defaultCollection;
    }
  }

  #sortedVideoFiles(files) {
    return Array.from(files || []).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }
}
