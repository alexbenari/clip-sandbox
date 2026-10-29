// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { sourceMovieFixture, sourceMovieTag, sourceMovieTagsV2 } from '../support/source-movie-fixtures.js';

const require = createRequire(import.meta.url);
const { KEY, Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');
const { SourceInfo } = require('../../electron/clip-provenance/source-info.cjs');
const fingerprint = {
  fingerprintVersion: 1, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '123', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1', selectedStream: 0,
  streamMetadataDigest: 'b'.repeat(64),
};

describe('Mp4Provenance', () => {
  const provenance = new Mp4Provenance();

  const sourceInfo = SourceInfo.forMovieRange(
    SourceInfo.movieOf('D:\\private\\Movie.mkv', fingerprint),
    { start: 2, end: 4 },
    [{ frameIndex: 2, frameInfoHash: '0000000000000002' }, { frameIndex: 4, frameInfoHash: '0000000000000004' }],
  );

  function createRecord(): string {
    return provenance.tagValueOf(sourceInfo);
  }

  it('stores the source info record as the tag value', () => {
    expect(JSON.parse(createRecord())).toEqual(sourceInfo.toRecord());
  });

  it('muxes the record under its metadata key', () => {
    const serialized = createRecord();
    expect(provenance.muxArguments(serialized)).toContain(`${KEY}=${serialized}`);
  });

  it('refuses a record larger than the MP4 metadata limit before muxing', () => {
    const oversized = { toRecord: () => ({ provenanceVersion: 2, padding: 'x'.repeat(5000) }) };

    expect(() => provenance.tagValueOf(oversized)).toThrow('Clip provenance exceeds the MP4 metadata limit.');
  });

  it('reads a version 1 tagged clip as a range whose reference frames are its ends', async () => {
    const sourceInfo = await provenance.read(sourceMovieFixture('tagged.mp4'));

    const tagged = JSON.parse(sourceMovieTag.value);
    expect(sourceInfo.toRecord()).toEqual({
      provenanceVersion: 2,
      sourceMovie: tagged.sourceMovie,
      sourceFrameRange: { start: 1200, end: 1260, endInclusive: true },
      referenceFrames: [tagged.sourceFrameRange.start, tagged.sourceFrameRange.end],
    });
  });

  it('reads a version 2 tagged clip with both ends as reference frames and their times', async () => {
    const sourceInfo = await provenance.read(sourceMovieFixture('tagged-v2.mp4'));

    expect(sourceInfo.toRecord()).toEqual(JSON.parse(sourceMovieTagsV2.bothEnds));
  });

  it('reads a version 2 tagged clip whose single reference frame is not an end of its range', async () => {
    const sourceInfo = await provenance.read(sourceMovieFixture('tagged-v2-single-reference.mp4'));

    expect(sourceInfo.toRecord()).toEqual(JSON.parse(sourceMovieTagsV2.singleReference));
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
