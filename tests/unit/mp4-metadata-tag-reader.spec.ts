// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceMovieFixture, sourceMovieTag } from '../support/source-movie-fixtures.js';

const require = createRequire(import.meta.url);
const { Mp4MetadataTagReader } = require('../../electron/clip-provenance/mp4-metadata-tag-reader.cjs');

describe('Mp4MetadataTagReader', () => {
  const reader = new Mp4MetadataTagReader();
  let workFolder = '';

  beforeEach(async () => {
    workFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'mp4-tag-reader-'));
  });

  afterEach(async () => {
    await fs.rm(workFolder, { recursive: true, force: true });
  });

  async function writeDerivedFixture(name: string, bytes: Buffer): Promise<string> {
    const filePath = path.join(workFolder, name);
    await fs.writeFile(filePath, bytes);
    return filePath;
  }

  it('returns the stored source-info value of a tagged clip', async () => {
    await expect(reader.read(sourceMovieFixture('tagged.mp4'), sourceMovieTag.key)).resolves.toBe(sourceMovieTag.value);
  });

  it('returns the stored value when the metadata follows the media data', async () => {
    await expect(reader.read(sourceMovieFixture('tagged-moov-at-end.mp4'), sourceMovieTag.key)).resolves.toBe(sourceMovieTag.value);
  });

  it('returns the value stored under the key when another key comes first', async () => {
    await expect(reader.read(sourceMovieFixture('tagged-after-other-key.mp4'), sourceMovieTag.key)).resolves.toBe(sourceMovieTag.value);
  });

  it('returns null for a clip written without the key', async () => {
    await expect(reader.read(sourceMovieFixture('untagged.mp4'), sourceMovieTag.key)).resolves.toBeNull();
  });

  it('returns null for a clip whose metadata holds only another key', async () => {
    await expect(reader.read(sourceMovieFixture('other-key.mp4'), sourceMovieTag.key)).resolves.toBeNull();
  });

  it('returns null for a clip whose movie box has no user-data box', async () => {
    const bytes = await fs.readFile(sourceMovieFixture('tagged.mp4'));
    const udtaTypeOffset = Mp4BoxLocator.childTypeOffset(bytes, 'moov', 'udta');
    bytes.write('free', udtaTypeOffset, 'latin1');
    const filePath = await writeDerivedFixture('no-udta.mp4', bytes);

    await expect(reader.read(filePath, sourceMovieTag.key)).resolves.toBeNull();
  });

  it('returns null for a clip cut off inside its metadata', async () => {
    const bytes = await fs.readFile(sourceMovieFixture('tagged.mp4'));
    const cut = bytes.indexOf('"sourceFrameRange"', 0, 'latin1');
    const filePath = await writeDerivedFixture('truncated.mp4', bytes.subarray(0, cut));

    await expect(reader.read(filePath, sourceMovieTag.key)).resolves.toBeNull();
  });

  it('returns null when the metadata box is larger than the reader accepts', async () => {
    await expect(reader.read(sourceMovieFixture('oversized.mp4'), sourceMovieTag.key)).resolves.toBeNull();
  });

  it('rejects with the file-system error when the clip cannot be opened', async () => {
    await expect(reader.read(path.join(workFolder, 'missing.mp4'), sourceMovieTag.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

class Mp4BoxLocator {
  static childTypeOffset(bytes: Buffer, parentType: string, childType: string): number {
    const parent = Mp4BoxLocator.boxes(bytes, 0, bytes.length).find(box => box.type === parentType);
    if (!parent) throw new Error(`Fixture has no ${parentType} box.`);
    const child = Mp4BoxLocator.boxes(bytes, parent.start + 8, parent.end).find(box => box.type === childType);
    if (!child) throw new Error(`Fixture has no ${childType} box inside ${parentType}.`);
    return child.start + 4;
  }

  private static boxes(bytes: Buffer, start: number, end: number): { type: string; start: number; end: number }[] {
    const found = [];
    for (let offset = start; offset + 8 <= end;) {
      const size = bytes.readUInt32BE(offset);
      if (size < 8) throw new Error('Fixture box sizes this locator does not handle.');
      found.push({ type: bytes.toString('latin1', offset + 4, offset + 8), start: offset, end: offset + size });
      offset += size;
    }
    return found;
  }
}
