import { Clip } from '../../src/domain/clip.js';
import { ClipSource } from '../../src/domain/clip-source.js';
import type { FolderEntry } from '../../src/business-logic/folder-entry.js';

export function clipSource(name: string, { mediaSource = `file:///clips/${name}`, desktopPath = null }: {
  mediaSource?: string;
  desktopPath?: string | null;
} = {}): ClipSource {
  return ClipSource.create({ name, mediaSource, desktopPath });
}

export function testClip(id: string, name: string, options: Parameters<typeof clipSource>[1] = {}): Clip {
  return new Clip({ id, source: clipSource(name, options) });
}

export function folderEntry(name: string, { text, type, mediaSource = `file:///clips/${name}`, desktopPath = null }: {
  text?: string;
  type?: string;
  mediaSource?: string;
  desktopPath?: string | null;
} = {}): FolderEntry {
  const entryType = type ?? (name.endsWith('.txt') ? 'text/plain' : 'video/mp4');
  return Object.freeze({ name, type: entryType, mediaSource, desktopPath, ...(text === undefined ? {} : { text }) });
}
