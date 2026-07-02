import { Clip } from './clip.js';
import { ClipSequence } from './clip-sequence.js';
import { Collection } from './collection.js';
import type { ClipFile } from './clip.js';
import type { CollectionMaterialization } from './collection.js';

export type PipelineMaterialization = { kind: 'loaded'; sequence: ClipSequence };

export type AddClipsToCollectionResult =
  | { ok: false; code: 'invalid-destination' }
  | {
    ok: true;
    code: 'no-op' | 'added';
    collection: Collection;
    previousCollection: Collection | null;
    destinationName: string;
    filename: string | null;
    addedClipNames: string[];
    skippedClipNames: string[];
    addedCount: number;
    skippedCount: number;
    isNoOp: boolean;
    created: boolean;
  };

export type RemovedCollectionChange = {
  filename: string;
  collectionName: string;
  previousCollection: Collection;
  collection: Collection;
  removedClipNames: string[];
  removedCount: number;
};

export type RemoveVideosResult = {
  removedVideoNames: string[];
  changedCollections: RemovedCollectionChange[];
};

function sortedFiles(files: Iterable<ClipFile>): ClipFile[] {
  return Array.from(files || []).sort((a, b) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

export class Pipeline {
  #folderName: string;
  #videoFilesByName: Map<string, ClipFile>;
  #clipsByName: Map<string, Clip>;
  #collectionsByFilename: Map<string, Collection>;

  constructor({ folderName = '', videoFiles = [], collections = [] }: {
    folderName?: string;
    videoFiles?: Iterable<ClipFile>;
    collections?: Iterable<Collection>;
  } = {}) {
    this.#folderName = String(folderName || '').trim();
    this.#videoFilesByName = new Map();
    this.#clipsByName = new Map();
    this.#collectionsByFilename = new Map();
    this.setVideoFiles(videoFiles);
    this.setCollections(collections);
  }

  get folderName() {
    return this.#folderName;
  }

  displayLabel(): string {
    return this.#folderName || 'Pipeline';
  }

  materializePipeline({ nextClipId }: { nextClipId?: () => string } = {}): PipelineMaterialization {
    if (typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to materialize a pipeline sequence.');
    }
    return {
      kind: 'loaded',
      sequence: new ClipSequence({
        name: this.displayLabel(),
        clips: this.videoFiles().map((file) => this.#clipForFile(file, nextClipId)),
      }),
    };
  }

  setVideoFiles(videoFiles: Iterable<ClipFile>): void {
    this.#videoFilesByName = new Map(
      sortedFiles(videoFiles).map((file) => [file.name, file])
    );
    for (const [name, clip] of Array.from(this.#clipsByName.entries())) {
      const nextFile = this.#videoFilesByName.get(name);
      if (nextFile) {
        clip.replaceFile(nextFile);
        continue;
      }
      this.#clipsByName.delete(name);
    }
  }

  videoFiles(): ClipFile[] {
    return Array.from(this.#videoFilesByName.values());
  }

  videoFileMap(): Map<string, ClipFile> {
    return new Map(this.#videoFilesByName);
  }

  clipMap(): Map<string, Clip> {
    return new Map(this.#clipsByName);
  }

  videoNames(): string[] {
    return Array.from(this.#videoFilesByName.keys());
  }

  upsertVideoFile(videoFile: ClipFile): boolean {
    if (!videoFile?.name) return false;
    this.#videoFilesByName.set(videoFile.name, videoFile);
    this.setVideoFiles(this.#videoFilesByName.values());
    return true;
  }

  upsertVideoClip(videoFile: ClipFile, { nextClipId }: { nextClipId?: () => string } = {}): Clip | null {
    if (!this.upsertVideoFile(videoFile)) return null;
    return this.#clipForFile(videoFile, nextClipId);
  }

  setCollections(collections: Iterable<Collection>): void {
    this.#collectionsByFilename = new Map();
    for (const collection of Array.from(collections || [])) {
      const filename = collection instanceof Collection ? collection.filename : null;
      if (!filename) continue;
      this.#collectionsByFilename.set(Pipeline.#collectionIdentityKey(filename), collection);
    }
  }

  upsertCollection(collection: Collection): void {
    if (!(collection instanceof Collection) || !collection.filename) return;
    this.#collectionsByFilename.set(Pipeline.#collectionIdentityKey(collection.filename), collection);
  }

  removeCollection(filename: string): void {
    const identityKey = Pipeline.#collectionIdentityKey(filename);
    if (!identityKey) return;
    this.#collectionsByFilename.delete(identityKey);
  }

  collections(): Collection[] {
    return Array.from(this.#collectionsByFilename.values())
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName, undefined, { sensitivity: 'base', numeric: true }));
  }

  getCollectionByFilename(filename: string): Collection | null {
    const identityKey = Pipeline.#collectionIdentityKey(filename);
    if (!identityKey) return null;
    return this.#collectionsByFilename.get(identityKey) || null;
  }

  addClipsToCollection({
    collectionFilename = '',
    clipNames = [],
  }: { collectionFilename?: string; clipNames?: Iterable<string> } = {}): AddClipsToCollectionResult {
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

    const nextCollection = merged.collection.withFilename(previousCollection?.filename || normalizedFilename);
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

  materializeCollection(collection: Collection | null | undefined, { nextClipId }: { nextClipId?: () => string } = {}): CollectionMaterialization | null {
    if (!(collection instanceof Collection) || typeof nextClipId !== 'function') return null;
    for (const file of this.videoFiles()) {
      this.#clipForFile(file, nextClipId);
    }
    return collection.materializeClipSequence({
      availableClips: this.#clipsByName,
    });
  }

  materializeSelection(collection: Collection | null | undefined, { nextClipId }: { nextClipId?: () => string } = {}): {
    selection: Pipeline | Collection;
    materialization: PipelineMaterialization | CollectionMaterialization;
  } | null {
    if (!(collection instanceof Collection)) {
      return {
        selection: this,
        materialization: this.materializePipeline({ nextClipId }),
      };
    }

    const materialization = this.materializeCollection(collection, { nextClipId });
    if (!materialization) return null;
    return {
      selection: collection,
      materialization,
    };
  }

  removeVideos(videoNames: Iterable<string>): RemoveVideosResult {
    const namesToRemove = new Set(Array.from(videoNames || []).filter(Boolean));
    const removedVideoNames = this.videoNames().filter((name) => namesToRemove.has(name));

    if (removedVideoNames.length === 0) {
      return {
        removedVideoNames: [],
        changedCollections: [],
      };
    }

    const changedCollections: RemovedCollectionChange[] = [];
    for (const collection of this.collections()) {
      const pruned = collection.removeVideos(removedVideoNames);
      if (pruned.isNoOp) continue;

      const nextCollection = pruned.collection.withFilename(collection.filename);
      this.upsertCollection(nextCollection);
      if (!collection.filename) continue;
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

  savedCollectionEntriesContainingClipNames(clipNames: Iterable<string>): { collection: Collection; filename: string }[] {
    const names = new Set(Array.from(clipNames || []).filter(Boolean));
    if (names.size === 0) return [];
    return this.collections().filter((collection) =>
      collection.orderedClipNames.some((clipName) => names.has(clipName))
    ).map((collection) => ({
      collection,
      filename: collection.filename || '',
    }));
  }

  eligibleDestinationCollections(activeCollectionFilename: string | null | undefined = null): Collection[] {
    const activeIdentityKey = Pipeline.#collectionIdentityKey(activeCollectionFilename);
    return this.collections().filter((collection) => {
      if (!activeIdentityKey) return true;
      return Pipeline.#collectionIdentityKey(collection.filename) !== activeIdentityKey;
    });
  }

  static #collectionIdentityKey(filename: string | null | undefined): string {
    return Collection.identityKeyFromFilename(filename);
  }

  #clipForFile(file: ClipFile, nextClipId?: () => string): Clip {
    const name = file?.name || '';
    if (!name) throw new Error('Clip file name is required.');
    const existing = this.#clipsByName.get(name);
    if (existing) {
      existing.replaceFile(file);
      return existing;
    }
    if (typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to create a pipeline clip.');
    }
    const clip = new Clip({
      id: nextClipId(),
      file,
      mediaSource: file?.mediaSource || '',
    });
    this.#clipsByName.set(name, clip);
    return clip;
  }
}

