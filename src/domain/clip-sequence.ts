// @ts-nocheck
import { Collection } from './collection.js';

export class ClipSequence {
  #name;
  /** @type {string[]} */
  #orderedClipIds;
  /** @type {Map<string, import('./clip.js').Clip>} */
  #clipMap;

  /**
   * @param {{ name?: string, clips?: Iterable<import('./clip.js').Clip> }} [params]
   */
  constructor({ name = '', clips = [] } = {}) {
    this.#name = (name || '').trim();
    this.#orderedClipIds = [];
    this.#clipMap = new Map();
    for (const clip of Array.from(clips || [])) {
      this.#addClip(clip);
    }
  }

  get name() {
    return this.#name;
  }

  /**
   * @param {string} name
   * @returns {void}
   */
  rename(name) {
    this.#name = (name || '').trim();
  }

  /**
   * @param {string} clipId
   * @returns {boolean}
   */
  hasClip(clipId) {
    return this.#clipMap.has(clipId);
  }

  /**
   * @param {string} clipId
   * @returns {import('./clip.js').Clip | null}
   */
  getClip(clipId) {
    return this.#clipMap.get(clipId) || null;
  }

  /** @returns {import('./clip.js').Clip[]} */
  orderedClips() {
    return this.#orderedClipIds.flatMap((clipId) => {
      const clip = this.#clipMap.get(clipId);
      return clip ? [clip] : [];
    });
  }

  /**
   * @param {Iterable<string>} orderedClipIds
   * @returns {import('./clip.js').Clip[]}
   */
  clipsForIdsInOrder(orderedClipIds) {
    return Array.from(orderedClipIds || []).flatMap((clipId) => {
      const clip = this.#clipMap.get(clipId);
      return clip ? [clip] : [];
    });
  }

  /**
   * @param {Iterable<string>} orderedClipIds
   * @returns {string[]}
   */
  clipNamesForIdsInOrder(orderedClipIds) {
    return this.clipsForIdsInOrder(orderedClipIds).map((clip) => clip.name);
  }

  /**
   * @param {Iterable<string>} orderedClipIds
   * @returns {string[]}
   */
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

  /**
   * @param {string} clipId
   * @returns {boolean}
   */
  remove(clipId) {
    if (!this.#clipMap.has(clipId)) return false;
    this.#clipMap.delete(clipId);
    this.#orderedClipIds = this.#orderedClipIds.filter((id) => id !== clipId);
    return true;
  }

  /**
   * @param {Iterable<string>} orderedClipIds
   * @returns {string[]}
   */
  removeMany(orderedClipIds) {
    const removedClipIds = [];
    for (const clipId of Array.from(orderedClipIds || [])) {
      if (!this.remove(clipId)) continue;
      removedClipIds.push(clipId);
    }
    return removedClipIds;
  }

  /** @returns {string[]} */
  clipNamesInOrder() {
    return this.orderedClips().map((clip) => clip.name);
  }

  /**
   * @param {{ filename?: string | null, collectionName?: string }} [options]
   * @returns {Collection}
   */
  toCollection({ filename = null, collectionName = '' } = {}) {
    return new Collection({
      collectionName,
      filename,
      orderedClipNames: this.clipNamesInOrder(),
    });
  }

  /**
   * @param {import('./clip.js').Clip} clip
   * @returns {boolean}
   */
  #addClip(clip) {
    if (!clip?.id) throw new Error('Clip id is required.');
    if (this.#clipMap.has(clip.id)) return false;
    this.#clipMap.set(clip.id, clip);
    this.#orderedClipIds.push(clip.id);
    return true;
  }
}

