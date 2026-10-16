import { Clip } from '../../src/domain/clip.js';
import { ClipSource } from '../../src/domain/clip-source.js';

export function clipSource(name: string, { mediaSource = `file:///clips/${name}`, desktopPath = null }: {
  mediaSource?: string;
  desktopPath?: string | null;
} = {}): ClipSource {
  return ClipSource.create({ name, mediaSource, desktopPath });
}

export function testClip(id: string, name: string, options: Parameters<typeof clipSource>[1] = {}): Clip {
  return new Clip({ id, source: clipSource(name, options) });
}
