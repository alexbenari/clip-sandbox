import { describe, expect, it } from 'vitest';

import {
  assertSampledContentSignature,
  buildSampledPreparationIdentity,
  sampledContentSignaturesMatch,
} from '../../src/preparation/sampled-content-signature.mjs';

function signature(overrides = {}) {
  return {
    type: 'sampled-packet-signature',
    profileVersion: 'sampled-packets-3m-3m-3x1m-v1',
    sourceBytes: 1_000_000,
    durationUs: 7_200_000_000,
    streamIndex: 0,
    codec: 'h264',
    streamMetadataDigest: 'metadata-digest',
    sampleDigest: 'sample-digest',
    sampledPacketCount: 10_000,
    ranges: [
      { startUs: 0, endUs: 300_000_000 },
      { startUs: 6_900_000_000, endUs: 7_200_000_000 },
    ],
    ...overrides,
  };
}

describe('sampled content signature', () => {
  it('builds cache identity from sampled content and compatibility inputs', () => {
    const identity = buildSampledPreparationIdentity(signature(), {
      bestSourceVersion: 'commit-a',
      ffmpegVersion: '9.0',
      indexingOptions: { decoderInstances: 2 },
    });

    expect(identity).toEqual({
      sourceBytes: 1_000_000,
      durationUs: 7_200_000_000,
      sourceSampleDigest: 'sample-digest',
      streamMetadataDigest: 'metadata-digest',
      selectedTrack: 0,
      signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
      preparationContractVersion: 'prepared-review-v2',
      bestSourceVersion: 'commit-a',
      ffmpegVersion: '9.0',
      indexingOptions: { decoderInstances: 2 },
    });
  });

  it('rejects changed bytes even when file metadata is unchanged', () => {
    expect(sampledContentSignaturesMatch(signature(), signature({ sampleDigest: 'changed' })))
      .toBe(false);
  });

  it('requires the stored deterministic sample locations to match', () => {
    expect(sampledContentSignaturesMatch(signature(), signature({
      ranges: [{ startUs: 1, endUs: 300_000_001 }],
    }))).toBe(false);
  });

  it('rejects overlapping or unordered ranges', () => {
    expect(() => assertSampledContentSignature(signature({
      ranges: [
        { startUs: 10, endUs: 20 },
        { startUs: 19, endUs: 30 },
      ],
    }))).toThrow('invalid or overlapping range');
  });
});
