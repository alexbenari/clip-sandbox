import { describe, expect, it } from 'vitest';

import { SavedCaptureCodec } from '../../src/app/saved-capture-codec.js';

// A capture file exactly as the app has written it since the format was introduced.
const fileOnDisk = Object.freeze({
  schemaVersion: 1,
  nextRangeSequence: 4,
  draft: { start: { kind: 'exact-frame', frameIndex: 30, frameInfoHash: '000000000000001e', reviewTimeUs: '300000' }, end: null },
  ranges: [
    { id: 'range-1', start: { kind: 'exact-frame', frameIndex: 2, frameInfoHash: '0000000000000002', reviewTimeUs: '20000' },
      end: { kind: 'exact-frame', frameIndex: 4, frameInfoHash: '0000000000000004', reviewTimeUs: '40000' } },
    { id: 'range-3', start: { kind: 'playback-timestamp', timestampUs: '100000' },
      end: { kind: 'playback-timestamp', timestampUs: '200000' } },
  ],
});

describe('SavedCaptureCodec', () => {
  const codec = new SavedCaptureCodec();

  it('loads a file in the existing format as saved ranges and a draft, and writes it back unchanged', () => {
    const model = codec.decode(fileOnDisk, 7);

    expect(model.snapshot.ranges.map(range => [range.id, range.kind])).toEqual([
      ['range-1', 'saved-exact-range'], ['range-3', 'needs-exact-frames']]);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: { kind: 'saved-exact-frame', frameIndex: 30 }, end: null });
    expect(model.nextRangeSequence).toBe(4);
    expect(codec.encode(model)).toEqual(fileOnDisk);
  });

  it('leaves extracted ranges out of the file', () => {
    const model = codec.decode(fileOnDisk, 7);

    expect(codec.encode(model, new Set(['range-1'])).ranges.map(range => range.id)).toEqual(['range-3']);
  });

  it('refuses an unknown version, a repeated range ID and a sequence that would reuse an ID', () => {
    expect(() => codec.decode({ ...fileOnDisk, schemaVersion: 2 }, 7)).toThrow('Saved capture data is invalid or unsupported.');
    expect(() => codec.decode({ ...fileOnDisk, ranges: [fileOnDisk.ranges[0], fileOnDisk.ranges[0]] }, 7))
      .toThrow('Saved range ID is invalid or duplicated.');
    expect(() => codec.decode({ ...fileOnDisk, nextRangeSequence: 3 }, 7)).toThrow('Saved range sequence would reuse an ID.');
  });
});
