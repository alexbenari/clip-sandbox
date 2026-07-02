import type { ClipFile, Clip } from '../domain/clip.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline, PipelineMaterialization, RemoveVideosResult } from '../domain/pipeline.js';

type CreatedClipInsertResult =
  | { ok: false; code: 'missing-pipeline' | 'invalid-file' | 'missing-context' | 'missing-source-clip' }
  | { ok: true; clip: Clip; sequence: ClipSequence };

export class PipelineSession {
  #pipeline: Pipeline | null = null;
  #activeCollection: Collection | null = null;
  #currentClipSequence: ClipSequence | null = null;
  #hasDirtyClipSequenceChanges = false;
  #idCounter = 0;

  get pipeline() {
    return this.#pipeline;
  }

  get activeCollection() {
    return this.#activeCollection;
  }

  get currentClipSequence() {
    return this.#currentClipSequence;
  }

  get hasDirtyClipSequenceChanges() {
    return this.#hasDirtyClipSequenceChanges;
  }

  nextClipId(): string {
    this.#idCounter += 1;
    return `clip_${this.#idCounter}`;
  }

  reset(): void {
    this.#pipeline = null;
    this.#activeCollection = null;
    this.#currentClipSequence = null;
    this.#hasDirtyClipSequenceChanges = false;
  }

  loadPipeline(pipeline: Pipeline | null | undefined): PipelineMaterialization | null {
    this.#pipeline = pipeline || null;
    this.#activeCollection = null;
    this.#currentClipSequence = null;
    this.#hasDirtyClipSequenceChanges = false;
    if (!this.#pipeline) return null;
    const result = this.#pipeline.materializePipeline({
      nextClipId: () => this.nextClipId(),
    });
    this.activateSelection({
      collection: null,
      sequence: result.sequence,
    });
    return result;
  }

  materializeSelection(collection: Collection | null | undefined = this.#activeCollection) {
    if (!this.#pipeline) return null;
    return this.#pipeline.materializeSelection(collection, {
      nextClipId: () => this.nextClipId(),
    });
  }

  activateSelection({ collection = null, sequence = null }: { collection?: Collection | null; sequence?: ClipSequence | null } = {}): ClipSequence | null {
    this.#activeCollection = collection || null;
    this.#currentClipSequence = sequence || null;
    this.refreshDirtyClipSequenceState();
    return this.#currentClipSequence;
  }

  isPipelineMode(): boolean {
    return !this.#activeCollection;
  }

  activeCollectionFilename(): string {
    return this.#activeCollection?.filename || '';
  }

  resolveClip(clipId: string | null | undefined): Clip | null {
    if (!clipId) return null;
    return this.#currentClipSequence?.getClip(clipId) || null;
  }

  clipNamesForIdsInOrder(clipIds: Iterable<string>): string[] {
    return this.#currentClipSequence?.clipNamesForIdsInOrder?.(clipIds) || [];
  }

  replaceCurrentOrder(orderedClipIds: Iterable<string>): string[] {
    if (!this.#currentClipSequence) return [];
    const result = this.#currentClipSequence.replaceOrder(orderedClipIds);
    this.refreshDirtyClipSequenceState();
    return result;
  }

  removeFromCurrentSequence(orderedClipIds: Iterable<string>): string[] {
    if (!this.#currentClipSequence) return [];
    const removedClipIds = this.#currentClipSequence.removeMany(orderedClipIds);
    if (removedClipIds.length > 0) {
      this.refreshDirtyClipSequenceState();
    }
    return removedClipIds;
  }

  collectionFromCurrentSequence(filename: string | null): Collection | null {
    return this.#currentClipSequence?.toCollection?.({ filename }) || null;
  }

  markCurrentSequenceSavedAs(collection: Collection | null | undefined): Collection | null {
    if (!collection || !this.#currentClipSequence) return null;
    this.#pipeline?.upsertCollection(collection);
    this.#currentClipSequence.rename(collection.collectionName);
    this.#activeCollection = collection;
    this.refreshDirtyClipSequenceState();
    return collection;
  }

  refreshDirtyClipSequenceState(): boolean {
    const baseline = this.#activeCollection
      ? this.#activeCollection.orderedClipNames
      : (this.#pipeline?.videoNames?.() || []);
    const currentNames = this.#currentClipSequence?.clipNamesInOrder?.() || [];
    this.#hasDirtyClipSequenceChanges = currentNames.length !== baseline.length
      || currentNames.some((name, index) => name !== baseline[index]);
    return this.#hasDirtyClipSequenceChanges;
  }

  insertCreatedClipInPipeline(createdFile: ClipFile): CreatedClipInsertResult {
    if (!this.#pipeline) return { ok: false, code: 'missing-pipeline' };
    const clip = this.#pipeline.upsertVideoClip(createdFile, {
      nextClipId: () => this.nextClipId(),
    });
    if (!clip) return { ok: false, code: 'invalid-file' };
    const result = this.#pipeline.materializePipeline({
      nextClipId: () => this.nextClipId(),
    });
    this.activateSelection({
      collection: null,
      sequence: result.sequence,
    });
    return {
      ok: true,
      clip,
      sequence: result.sequence,
    };
  }

  insertCreatedClipAfter(sourceClipId: string, createdFile: ClipFile): CreatedClipInsertResult {
    if (!this.#pipeline || !this.#currentClipSequence) {
      return { ok: false, code: 'missing-context' };
    }
    if (!this.#currentClipSequence.hasClip(sourceClipId)) {
      return { ok: false, code: 'missing-source-clip' };
    }
    const clip = this.#pipeline.upsertVideoClip(createdFile, {
      nextClipId: () => this.nextClipId(),
    });
    if (!clip) return { ok: false, code: 'invalid-file' };
    this.#currentClipSequence.insertAfter(sourceClipId, clip);
    this.refreshDirtyClipSequenceState();
    return {
      ok: true,
      clip,
      sequence: this.#currentClipSequence,
    };
  }

  removeVideos(videoNames: Iterable<string>): RemoveVideosResult {
    return this.#pipeline?.removeVideos(videoNames) || {
      removedVideoNames: [],
      changedCollections: [],
    };
  }
}

export function createPipelineSession(): PipelineSession {
  return new PipelineSession();
}
