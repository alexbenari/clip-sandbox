// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { SourceInfo } = require('../../electron/clip-provenance/source-info.cjs');

const fingerprint = {
  fingerprintVersion: 1,
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '1234567890', sourceDurationUs: '5400000000',
  signatureProfileVersion: 'profile-1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};
const sourceMovie = { displayName: 'Sample Feature.2001.mkv', fingerprint };

function versionOneRecord() {
  return {
    provenanceVersion: 1,
    sourceMovie,
    sourceFrameRange: {
      start: { frameIndex: 1200, frameInfoHash: '0123456789abcdef' },
      end: { frameIndex: 1260, frameInfoHash: 'fedcba9876543210' },
      endInclusive: true,
    },
  };
}

function versionTwoRecord(overrides: Record<string, unknown> = {}) {
  return {
    provenanceVersion: 2,
    sourceMovie,
    sourceFrameRange: { start: 1300, end: 1340, endInclusive: true, startTimeUs: 54_221_000, endTimeUs: 55_889_000 },
    referenceFrames: [{ frameIndex: 1200, frameInfoHash: '0123456789abcdef' }],
    ...overrides,
  };
}

describe('SourceInfo', () => {
  it('reads a version 1 record as its range with both ends as reference frames and no stored times', () => {
    expect(SourceInfo.fromRecord(versionOneRecord()).toRecord()).toEqual({
      provenanceVersion: 2,
      sourceMovie,
      sourceFrameRange: { start: 1200, end: 1260, endInclusive: true },
      referenceFrames: [
        { frameIndex: 1200, frameInfoHash: '0123456789abcdef' },
        { frameIndex: 1260, frameInfoHash: 'fedcba9876543210' },
      ],
    });
  });

  it('reads a version 2 record whose only reference frame lies outside its range', () => {
    expect(SourceInfo.fromRecord(versionTwoRecord()).toRecord()).toEqual(versionTwoRecord());
  });

  it('names the movie and its range for its readers', () => {
    const info = SourceInfo.fromRecord(versionTwoRecord());

    expect([info.movieDisplayName, info.sourceMovie, info.range]).toEqual([
      'Sample Feature.2001.mkv', sourceMovie, { start: 1300, end: 1340, startTimeUs: 54_221_000, endTimeUs: 55_889_000 },
    ]);
  });

  it.each([
    ['no reference frame', versionTwoRecord({ referenceFrames: [] })],
    ['five reference frames', versionTwoRecord({ referenceFrames: Array.from({ length: 5 }, (_, index) => ({ frameIndex: index, frameInfoHash: '0123456789abcdef' })) })],
    ['a reference frame check value that is not 16 hex digits', versionTwoRecord({ referenceFrames: [{ frameIndex: 1, frameInfoHash: 'XYZ' }] })],
    ['a negative reference frame number', versionTwoRecord({ referenceFrames: [{ frameIndex: -1, frameInfoHash: '0123456789abcdef' }] })],
    ['a range ending before it starts', versionTwoRecord({ sourceFrameRange: { start: 10, end: 9, endInclusive: true } })],
    ['a fractional frame number', versionTwoRecord({ sourceFrameRange: { start: 10.5, end: 19, endInclusive: true } })],
    ['a negative stored time', versionTwoRecord({ sourceFrameRange: { start: 10, end: 19, endInclusive: true, startTimeUs: -1 } })],
    ['an exclusive range end', versionTwoRecord({ sourceFrameRange: { start: 10, end: 19, endInclusive: false } })],
    ['an unknown record version', versionTwoRecord({ provenanceVersion: 3 })],
    ['a movie name with a folder', versionTwoRecord({ sourceMovie: { displayName: 'movies\\Sample.mkv', fingerprint } })],
    ['a movie name longer than 512 characters', versionTwoRecord({ sourceMovie: { displayName: `Sample${'x'.repeat(503)}.mkv`, fingerprint } })],
    ['a fingerprint digest of the wrong length', versionTwoRecord({ sourceMovie: { displayName: 'Sample.mkv', fingerprint: { ...fingerprint, sourceSampleDigest: 'a' } } })],
  ])('refuses a record with %s', (_case, record) => {
    expect(() => SourceInfo.fromRecord(record)).toThrow('Clip provenance is invalid or unsupported.');
  });

  it('shifts a trimmed range and keeps the movie, reference frames and stored times', () => {
    const trimmed = SourceInfo.fromRecord(versionTwoRecord()).trimmed(3, -5);

    expect(trimmed.toRecord()).toEqual(versionTwoRecord({
      sourceFrameRange: { start: 1303, end: 1335, endInclusive: true, startTimeUs: 54_221_000, endTimeUs: 55_889_000 },
    }));
  });

  it.each([
    ['extends the start', -1, 0],
    ['extends the end', 0, 1],
    ['leaves no frame', 30, -11],
  ])('refuses a trim that %s', (_case, startOffset, endOffset) => {
    expect(() => SourceInfo.fromRecord(versionTwoRecord()).trimmed(startOffset, endOffset))
      .toThrow('A trim must keep at least one frame of the clip.');
  });

  describe('exact stored times', () => {
    const endsAsReferences = () => SourceInfo.fromRecord(versionTwoRecord({
      referenceFrames: [{ frameIndex: 1300, frameInfoHash: '0123456789abcdef' }, { frameIndex: 1340, frameInfoHash: 'fedcba9876543210' }],
    }));

    it('answers the stored times of both ends while the reference frames are the range’s ends', () => {
      const info = endsAsReferences();

      expect([info.exactTimeUsOf(1300), info.exactTimeUsOf(1340)]).toEqual([54_221_000, 55_889_000]);
    });

    it('answers no time for a frame that is not an end', () => {
      expect(endsAsReferences().exactTimeUsOf(1320)).toBeUndefined();
    });

    it('answers no time for an end of a trimmed record, whose stored times belong to the original ends', () => {
      expect(endsAsReferences().trimmed(0, -5).exactTimeUsOf(1300)).toBeUndefined();
    });

    it('answers no time for a record trimmed to a single frame that is one of its reference frames', () => {
      const singleFrame = endsAsReferences().trimmed(40, 0);

      expect([singleFrame.exactTimeUsOf(1340), singleFrame.range]).toEqual([undefined, { start: 1340, end: 1340, startTimeUs: 54_221_000, endTimeUs: 55_889_000 }]);
    });

    it('answers no time for a record whose reference frame is not an end', () => {
      expect(SourceInfo.fromRecord(versionTwoRecord()).exactTimeUsOf(1300)).toBeUndefined();
    });
  });

  it('builds a complete record for a range cut from the movie', () => {
    const info = SourceInfo.forMovieRange(
      sourceMovie,
      { start: 1290, end: 1350, startTimeUs: 53_804_000, endTimeUs: 56_306_000 },
      [{ frameIndex: 1290, frameInfoHash: '1111111111111111' }, { frameIndex: 1350, frameInfoHash: '2222222222222222' }],
    );

    expect(info.toRecord()).toEqual({
      provenanceVersion: 2,
      sourceMovie,
      sourceFrameRange: { start: 1290, end: 1350, endInclusive: true, startTimeUs: 53_804_000, endTimeUs: 56_306_000 },
      referenceFrames: [{ frameIndex: 1290, frameInfoHash: '1111111111111111' }, { frameIndex: 1350, frameInfoHash: '2222222222222222' }],
    });
  });

  it('gives the movie time of a frame in whole microseconds, and none for a time before the movie starts', () => {
    const frame = (pts: bigint) => ({ pts, timebaseNumerator: 1n, timebaseDenominator: 90_000n });

    expect([SourceInfo.timeUsOf(frame(311_565_003n)), SourceInfo.timeUsOf(frame(-3_753n))]).toEqual([3_461_833_366, undefined]);
  });

  it('cannot be built around its validation', () => {
    expect(() => new SourceInfo(sourceMovie, { start: 9, end: 1 }, [])).toThrow('Source info is built only through its factories.');
  });

  it('builds the movie identity from a prepared source without its folder', () => {
    const identity = { ...fingerprint, fingerprintVersion: undefined, bestSourceVersion: 'x', proxyProfileId: 'y' };

    expect(SourceInfo.movieOf('D:\\private\\Sample Feature.2001.mkv', identity)).toEqual(sourceMovie);
  });
});
