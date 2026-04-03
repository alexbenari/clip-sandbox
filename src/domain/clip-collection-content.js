export class ClipCollectionContent {
  #collectionName;
  #filename;
  #orderedClipNames;

  constructor({
    collectionName = '',
    filename = null,
    orderedClipNames = [],
  } = {}) {
    this.#filename = ClipCollectionContent.#normalizedFilename(filename);
    this.#collectionName = ClipCollectionContent.#normalizedText(collectionName)
      || ClipCollectionContent.#collectionNameFromFilename(this.#filename);
    this.#orderedClipNames = ClipCollectionContent.#normalizedOrderedClipNames(orderedClipNames);
  }

  static createDefault({ folderName = '', orderedClipNames = [] } = {}) {
    return new ClipCollectionContent({
      collectionName: ClipCollectionContent.defaultCollectionNameForFolder(folderName),
      filename: null,
      orderedClipNames,
    });
  }

  static fromFilename({ filename = '', orderedClipNames = [] } = {}) {
    return new ClipCollectionContent({
      filename,
      orderedClipNames,
    });
  }

  static filenameFromCollectionName(collectionName) {
    const trimmed = ClipCollectionContent.#normalizedText(collectionName);
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.txt') ? trimmed : `${trimmed}.txt`;
  }

  static defaultCollectionNameForFolder(folderName) {
    const trimmed = ClipCollectionContent.#normalizedText(folderName);
    return trimmed ? `${trimmed}-default` : 'default';
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

  get isDefault() {
    return !this.hasBackingFile;
  }

  withOrderedClipNames(orderedClipNames) {
    return new ClipCollectionContent({
      collectionName: this.#collectionName,
      filename: this.#filename,
      orderedClipNames,
    });
  }

  withFilename(filename) {
    return new ClipCollectionContent({
      collectionName: this.#collectionName,
      filename,
      orderedClipNames: this.#orderedClipNames,
    });
  }

  appendMissingClipNames(orderedClipNames) {
    const existingNames = this.orderedClipNames;
    const seenNames = new Set(existingNames);
    const addedClipNames = [];
    const skippedClipNames = [];

    for (const clipName of ClipCollectionContent.#normalizedOrderedClipNames(orderedClipNames)) {
      if (seenNames.has(clipName)) {
        skippedClipNames.push(clipName);
        continue;
      }
      seenNames.add(clipName);
      addedClipNames.push(clipName);
    }

    const nextOrderedClipNames = existingNames.concat(addedClipNames);
    return {
      content: this.withOrderedClipNames(nextOrderedClipNames),
      addedClipNames,
      skippedClipNames,
      addedCount: addedClipNames.length,
      skippedCount: skippedClipNames.length,
      isNoOp: addedClipNames.length === 0,
    };
  }

  toText() {
    if (this.#orderedClipNames.length === 0) return '';
    return this.#orderedClipNames.join('\n') + '\n';
  }

  static #normalizedText(value) {
    return String(value || '').trim();
  }

  static #normalizedFilename(filename) {
    const trimmed = ClipCollectionContent.#normalizedText(filename);
    return trimmed ? ClipCollectionContent.filenameFromCollectionName(trimmed) : null;
  }

  static #collectionNameFromFilename(filename) {
    return ClipCollectionContent.#normalizedText((filename || '').replace(/\.txt$/i, ''));
  }

  static #normalizedOrderedClipNames(names) {
    return Array.from(names || [])
      .map((name) => ClipCollectionContent.#normalizedText(name))
      .filter(Boolean);
  }
}
