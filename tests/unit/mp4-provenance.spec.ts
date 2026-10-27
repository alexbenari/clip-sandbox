// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { sourceMovieFixture, sourceMovieTag } from '../support/source-movie-fixtures.js';

const require = createRequire(import.meta.url);
const { KEY, Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');
const fingerprint = {
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '123', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1', selectedStream: 0,
  streamMetadataDigest: 'b'.repeat(64),
};

describe('Mp4Provenance', () => {
  const provenance = new Mp4Provenance();

  function createRecord(): string {
    return provenance.create(
      { sourcePath: 'D:\\private\\Movie.mkv', identity: fingerprint },
      { frameIndex: 2, frameInfoHash: '0000000000000002' },
      { frameIndex: 4, frameInfoHash: '0000000000000004' },
    );
  }

  it('creates a source record without an absolute path', () => {
    const serialized = createRecord();
    expect(JSON.parse(serialized)).toMatchObject({
      provenanceVersion: 1,
      sourceMovie: { displayName: 'Movie.mkv', fingerprint: { fingerprintVersion: 1 } },
      sourceFrameRange: { start: { frameIndex: 2 }, end: { frameIndex: 4 }, endInclusive: true },
    });
    expect(serialized).not.toContain('private');
  });

  it('muxes the record under its metadata key', () => {
    const serialized = createRecord();
    expect(provenance.muxArguments(serialized)).toContain(`${KEY}=${serialized}`);
  });

  it('refuses a record whose movie name is too long before muxing', () => {
    expect(() => provenance.create(
      { sourcePath: `D:\\private\\${'x'.repeat(5000)}.mkv`, identity: fingerprint },
      { frameIndex: 2, frameInfoHash: '0000000000000002' },
      { frameIndex: 4, frameInfoHash: '0000000000000004' },
    )).toThrow('Clip provenance is invalid or unsupported.');
  });

  it('reads the source record of a tagged clip', async () => {
    await expect(provenance.read(sourceMovieFixture('tagged.mp4'))).resolves.toEqual(JSON.parse(sourceMovieTag.value));
  });

  it('reads no source record from an untagged clip', async () => {
    await expect(provenance.read(sourceMovieFixture('untagged.mp4'))).resolves.toBeNull();
  });

  it('reads no source record when the stored record is invalid', async () => {
    await expect(provenance.read(sourceMovieFixture('invalid-record.mp4'))).resolves.toBeNull();
  });

  it('reads no source record when the stored movie name contains a folder', async () => {
    const record = JSON.parse(sourceMovieTag.value);
    record.sourceMovie.displayName = 'movies\\Sample Feature.mkv';
    const provenanceReadingRecord = new Mp4Provenance({ tagReader: { read: async () => JSON.stringify(record) } });

    await expect(provenanceReadingRecord.read('clip.mp4')).resolves.toBeNull();
  });

  it('passes on the file-system error when the clip cannot be read', async () => {
    await expect(provenance.read(sourceMovieFixture('missing.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reads back the exact record written into a clip', async () => {
    await expect(provenance.readBack(sourceMovieFixture('tagged.mp4'))).resolves.toBe(sourceMovieTag.value);
  });

  it('fails the read-back when the written clip carries no valid record', async () => {
    await expect(provenance.readBack(sourceMovieFixture('untagged.mp4'))).rejects.toThrow('Clip provenance is missing or invalid.');
  });

  it('expects source records only in MP4 files', () => {
    expect(['clip.mp4', 'CLIP.MP4', 'clip.mov', 'clip.webm'].map(name => provenance.canBeTagged(name)))
      .toEqual([true, true, false, false]);
  });
});
