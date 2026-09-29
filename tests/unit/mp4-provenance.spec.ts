import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { KEY, Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');
const fingerprint = {
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '123', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1', selectedStream: 0,
  streamMetadataDigest: 'b'.repeat(64),
};

describe('Mp4Provenance', () => {
  it('creates a bounded source record without an absolute path and tolerates missing or malformed tags', async () => {
    const provenance = new Mp4Provenance();
    const serialized = provenance.create(
      { sourcePath: 'D:\\private\\Movie.mkv', identity: fingerprint },
      { frameIndex: 2, frameInfoHash: '0000000000000002' },
      { frameIndex: 4, frameInfoHash: '0000000000000004' },
    );
    expect(JSON.parse(serialized)).toMatchObject({
      provenanceVersion: 1,
      sourceMovie: { displayName: 'Movie.mkv', fingerprint: { fingerprintVersion: 1 } },
      sourceFrameRange: { start: { frameIndex: 2 }, end: { frameIndex: 4 }, endInclusive: true },
    });
    expect(serialized).not.toContain('private');
    expect(provenance.muxArguments(serialized)).toContain(`${KEY}=${serialized}`);
    const read = vi.fn(async (_probe: string, _args: string[]) => ({
      ok: true, stdout: JSON.stringify({ format: { tags: { [KEY]: serialized } } }),
    }));
    await expect(provenance.read('ffprobe', 'output.mp4', read)).resolves.toEqual(JSON.parse(serialized));
    read.mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({ format: { tags: {} } }) });
    await expect(provenance.read('ffprobe', 'output.mp4', read)).resolves.toBeNull();
    read.mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({ format: { tags: { [KEY]: '{bad' } } }) });
    await expect(provenance.read('ffprobe', 'output.mp4', read)).resolves.toBeNull();
  });

  it('refuses oversized records before muxing', () => {
    const provenance = new Mp4Provenance();
    expect(() => provenance.create(
      { sourcePath: `D:\\private\\${'x'.repeat(5000)}.mkv`, identity: fingerprint },
      { frameIndex: 2, frameInfoHash: '0000000000000002' },
      { frameIndex: 4, frameInfoHash: '0000000000000004' },
    )).toThrow();
  });
});
