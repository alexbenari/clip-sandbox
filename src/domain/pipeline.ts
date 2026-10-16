import { Clip } from './clip.js';
import { ClipSequence } from './clip-sequence.js';
import { ClipSource } from './clip-source.js';
import { Collection } from './collection.js';
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

export class Pipeline {
  #folderName: string;
  #videoSourcesByName: Map<string, ClipSource>;
  #clipsByName: Map<string, Clip>;
  #collectionsByFilename: Map<string, Collection>;

  constructor({ folderName = '', videoSources = [], collections = [] }: {
    folderName?: string;
    videoSources?: Iterable<ClipSource>;
    collections?: Iterable<Collection>;
  } = {}) {
    this.#folderName = String(folderName || '').trim();
    this.#videoSourcesByName = new Map();
    this.#clipsByName = new Map();
    this.#collectionsByFilename = new Map();
    this.setVideoSources(videoSources);
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
        clips: this.videoSources().map((source) => this.#clipForSource(source, nextClipId)),
      }),
    };
  }

  setVideoSources(videoSources: Iterable<ClipSource>): void {
    this.#videoSourcesByName = new Map(
      Pipeline.#sortedSources(videoSources).map((source) => [source.name, Pipeline.#requiredSource(source)])
    );
    for (const [name, clip] of Array.from(this.#clipsByName.entries())) {
      const nextSource = this.#videoSourcesByName.get(name);
      if (nextSource) {
        clip.replaceSource(nextSource);
        continue;
      }
      this.#clipsByName.delete(name);
    }
  }

  videoSources(): ClipSource[] {
    return Array.from(this.#videoSourcesByName.values());
  }

  clipMap(): Map<string, Clip> {
    return new Map(this.#clipsByName);
  }

  videoNames(): string[] {
    return Array.from(this.#videoSourcesByName.keys());
  }

  upsertVideoSource(source: ClipSource): boolean {
    if (!(source instanceof ClipSource)) return false;
    this.#videoSourcesByName.set(source.name, source);
    this.setVideoSources(this.#videoSourcesByName.values());
    return true;
  }

  upsertVideoClip(source: ClipSource, { nextClipId }: { nextClipId?: () => string } = {}): Clip | null {
    if (!this.upsertVideoSource(source)) return null;
    return this.#clipForSource(source, nextClipId);
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

  hasCollectionWithFilename(filename: string): boolean {
    return this.getCollectionByFilename(filename) !== null;
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
    const merged = baseCollection.withClipsAdded(clipNames);

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
    for (const source of this.videoSources()) {
      this.#clipForSource(source, nextClipId);
    }
    return collection.materializeClipSequence(this.#clipsByName);
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
      const pruned = collection.withoutClips(removedVideoNames);
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
    const remainingSources = this.videoSources().filter((source) => !removedNameSet.has(source.name));
    this.setVideoSources(remainingSources);

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

  static #sortedSources(sources: Iterable<ClipSource>): ClipSource[] {
    return Array.from(sources || []).sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  static #requiredSource(source: ClipSource): ClipSource {
    if (!(source instanceof ClipSource)) throw new Error('Pipeline video source is required.');
    return source;
  }

  #clipForSource(source: ClipSource, nextClipId?: () => string): Clip {
    const existing = this.#clipsByName.get(source.name);
    if (existing) {
      existing.replaceSource(source);
      return existing;
    }
    if (typeof nextClipId !== 'function') {
      throw new Error('A nextClipId function is required to create a pipeline clip.');
    }
    const clip = new Clip({ id: nextClipId(), source });
    this.#clipsByName.set(source.name, clip);
    return clip;
  }
}

