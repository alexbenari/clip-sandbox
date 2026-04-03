import { ClipCollectionContent } from './clip-collection-content.js';

export class ClipCollection {
  #name;
  #orderedClipIds;
  #clipMap;

  constructor({ name = '', clips = [] } = {}) {
    this.#name = (name || '').trim();
    this.#orderedClipIds = [];
    this.#clipMap = new Map();
    for (const clip of Array.from(clips || [])) {
      this.#addClip(clip);
    }
  }

  static fromClipNames({ name = '', orderedNames = [], clips = [] } = {}) {
    const clipsByName = new Map(Array.from(clips || []).map((clip) => [clip.name, clip]));
    const ordered = Array.from(orderedNames || [])
      .map((clipName) => clipsByName.get(clipName))
      .filter(Boolean);
    return new ClipCollection({ name, clips: ordered });
  }

  get name() {
    return this.#name;
  }

  rename(name) {
    this.#name = (name || '').trim();
  }

  hasClip(clipId) {
    return this.#clipMap.has(clipId);
  }

  getClip(clipId) {
    return this.#clipMap.get(clipId) || null;
  }

  orderedClips() {
    return this.#orderedClipIds
      .map((clipId) => this.#clipMap.get(clipId))
      .filter(Boolean);
  }

  clipsForIdsInOrder(orderedClipIds) {
    return Array.from(orderedClipIds || [])
      .map((clipId) => this.#clipMap.get(clipId))
      .filter(Boolean);
  }

  clipNamesForIdsInOrder(orderedClipIds) {
    return this.clipsForIdsInOrder(orderedClipIds).map((clip) => clip.name);
  }

  replaceOrder(orderedClipIds) {
    const seen = new Set();
    const nextOrder = Array.from(orderedClipIds || []).filter((clipId) => {
      if (!this.#clipMap.has(clipId) || seen.has(clipId)) return false;
      seen.add(clipId);
      return true;
    });
    const missing = Array.from(this.#clipMap.keys()).filter((clipId) => !seen.has(clipId));
    this.#orderedClipIds = nextOrder.concat(missing);
    return this.#orderedClipIds.slice();
  }

  remove(clipId) {
    if (!this.#clipMap.has(clipId)) return false;
    this.#clipMap.delete(clipId);
    this.#orderedClipIds = this.#orderedClipIds.filter((id) => id !== clipId);
    return true;
  }

  removeMany(orderedClipIds) {
    const removedClipIds = [];
    for (const clipId of Array.from(orderedClipIds || [])) {
      if (!this.remove(clipId)) continue;
      removedClipIds.push(clipId);
    }
    return removedClipIds;
  }

  clipNamesInOrder() {
    return this.orderedClips().map((clip) => clip.name);
  }

  toCollectionContent({ filename = null, collectionName = '' } = {}) {
    return new ClipCollectionContent({
      collectionName,
      filename,
      orderedClipNames: this.clipNamesInOrder(),
    });
  }

  #addClip(clip) {
    if (!clip?.id) throw new Error('Clip id is required.');
    if (this.#clipMap.has(clip.id)) return false;
    this.#clipMap.set(clip.id, clip);
    this.#orderedClipIds.push(clip.id);
    return true;
  }
}
