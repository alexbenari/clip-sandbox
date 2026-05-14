// @ts-nocheck
export class PipelineSession {
  #pipeline = null;
  #activeCollection = null;
  #currentClipSequence = null;
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

  nextClipId() {
    this.#idCounter += 1;
    return `clip_${this.#idCounter}`;
  }

  reset() {
    this.#pipeline = null;
    this.#activeCollection = null;
    this.#currentClipSequence = null;
    this.#hasDirtyClipSequenceChanges = false;
  }

  loadPipeline(pipeline) {
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

  materializeSelection(collection = this.#activeCollection) {
    if (!this.#pipeline) return null;
    return this.#pipeline.materializeSelection(collection, {
      nextClipId: () => this.nextClipId(),
    });
  }

  activateSelection({ collection = null, sequence = null } = {}) {
    this.#activeCollection = collection || null;
    this.#currentClipSequence = sequence || null;
    this.refreshDirtyClipSequenceState();
    return this.#currentClipSequence;
  }

  isPipelineMode() {
    return !this.#activeCollection;
  }

  activeCollectionFilename() {
    return this.#activeCollection?.filename || '';
  }

  resolveClip(clipId) {
    if (!clipId) return null;
    return this.#currentClipSequence?.getClip(clipId) || null;
  }

  clipNamesForIdsInOrder(clipIds) {
    return this.#currentClipSequence?.clipNamesForIdsInOrder?.(clipIds) || [];
  }

  replaceCurrentOrder(orderedClipIds) {
    if (!this.#currentClipSequence) return [];
    const result = this.#currentClipSequence.replaceOrder(orderedClipIds);
    this.refreshDirtyClipSequenceState();
    return result;
  }

  removeFromCurrentSequence(orderedClipIds) {
    if (!this.#currentClipSequence) return [];
    const removedClipIds = this.#currentClipSequence.removeMany(orderedClipIds);
    if (removedClipIds.length > 0) {
      this.refreshDirtyClipSequenceState();
    }
    return removedClipIds;
  }

  collectionFromCurrentSequence(filename) {
    return this.#currentClipSequence?.toCollection?.({ filename }) || null;
  }

  markCurrentSequenceSavedAs(collection) {
    if (!collection || !this.#currentClipSequence) return null;
    this.#pipeline?.upsertCollection(collection);
    this.#currentClipSequence.rename(collection.collectionName);
    this.#activeCollection = collection;
    this.refreshDirtyClipSequenceState();
    return collection;
  }

  refreshDirtyClipSequenceState() {
    const baseline = this.#activeCollection
      ? this.#activeCollection.orderedClipNames
      : (this.#pipeline?.videoNames?.() || []);
    const currentNames = this.#currentClipSequence?.clipNamesInOrder?.() || [];
    this.#hasDirtyClipSequenceChanges = currentNames.length !== baseline.length
      || currentNames.some((name, index) => name !== baseline[index]);
    return this.#hasDirtyClipSequenceChanges;
  }

  insertCreatedClipInPipeline(createdFile) {
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

  insertCreatedClipAfter(sourceClipId, createdFile) {
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

  removeVideos(videoNames) {
    return this.#pipeline?.removeVideos(videoNames) || {
      removedVideoNames: [],
      changedCollections: [],
    };
  }
}

export function createPipelineSession() {
  return new PipelineSession();
}
