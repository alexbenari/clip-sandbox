import type { Clip } from './clip.js';
import { Collection } from './collection.js';

type ClipSequenceParams = {
  name?: string;
  clips?: Iterable<Clip>;
};

export class ClipSequence {
  #name: string;
  #orderedClipIds: string[];
  #clipMap: Map<string, Clip>;

  constructor({ name = '', clips = [] }: ClipSequenceParams = {}) {
    this.#name = (name || '').trim();
    this.#orderedClipIds = [];
    this.#clipMap = new Map();
    for (const clip of Array.from(clips || [])) {
      this.#appendClip(clip);
    }
  }

  get name() {
    return this.#name;
  }

  rename(name: string): void {
    this.#name = (name || '').trim();
  }

  hasClip(clipId: string): boolean {
    return this.#clipMap.has(clipId);
  }

  getClip(clipId: string): Clip | null {
    return this.#clipMap.get(clipId) || null;
  }

  orderedClips(): Clip[] {
    return this.#orderedClipIds.flatMap((clipId) => {
      const clip = this.#clipMap.get(clipId);
      return clip ? [clip] : [];
    });
  }

  clipsForIdsInOrder(orderedClipIds: Iterable<string>): Clip[] {
    return Array.from(orderedClipIds || []).flatMap((clipId) => {
      const clip = this.#clipMap.get(clipId);
      return clip ? [clip] : [];
    });
  }

  clipNamesForIdsInOrder(orderedClipIds: Iterable<string>): string[] {
    return this.clipsForIdsInOrder(orderedClipIds).map((clip) => clip.name);
  }

  replaceOrder(orderedClipIds: Iterable<string>): string[] {
    const seen = new Set<string>();
    const nextOrder = Array.from(orderedClipIds || []).filter((clipId) => {
      if (!this.#clipMap.has(clipId) || seen.has(clipId)) return false;
      seen.add(clipId);
      return true;
    });
    const missing = Array.from(this.#clipMap.keys()).filter((clipId) => !seen.has(clipId));
    this.#orderedClipIds = nextOrder.concat(missing);
    return this.#orderedClipIds.slice();
  }

  remove(clipId: string): boolean {
    if (!this.#clipMap.has(clipId)) return false;
    this.#clipMap.delete(clipId);
    this.#orderedClipIds = this.#orderedClipIds.filter((id) => id !== clipId);
    return true;
  }

  removeMany(orderedClipIds: Iterable<string>): string[] {
    const removedClipIds: string[] = [];
    for (const clipId of Array.from(orderedClipIds || [])) {
      if (!this.remove(clipId)) continue;
      removedClipIds.push(clipId);
    }
    return removedClipIds;
  }

  insertAfter(anchorClipId: string, clip: Clip): boolean {
    const anchorIndex = this.#orderedClipIds.indexOf(anchorClipId);
    if (anchorIndex < 0) return false;
    return this.#insertClipAt(anchorIndex + 1, clip);
  }

  clipNamesInOrder(): string[] {
    return this.orderedClips().map((clip) => clip.name);
  }

  toCollection({ filename = null, collectionName = '' }: { filename?: string | null; collectionName?: string } = {}): Collection {
    return new Collection({
      collectionName,
      filename,
      orderedClipNames: this.clipNamesInOrder(),
    });
  }

  #appendClip(clip: Clip): boolean {
    return this.#insertClipAt(this.#orderedClipIds.length, clip);
  }

  #insertClipAt(index: number, clip: Clip): boolean {
    if (!clip?.id) throw new Error('Clip id is required.');
    if (this.#clipMap.has(clip.id)) return false;
    this.#clipMap.set(clip.id, clip);
    this.#orderedClipIds.splice(Math.max(0, index), 0, clip.id);
    return true;
  }
}

