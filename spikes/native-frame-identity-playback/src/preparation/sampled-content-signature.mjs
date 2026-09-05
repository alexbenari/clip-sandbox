export const DEFAULT_SAMPLE_SIGNATURE_PROFILE = Object.freeze({
  version: 'sampled-packets-3m-3m-3x1m-v1',
  headSeconds: 3 * 60,
  tailSeconds: 3 * 60,
  randomSegmentCount: 3,
  randomSegmentSeconds: 60,
});

export function assertSampledContentSignature(signature) {
  if (!signature || signature.type !== 'sampled-packet-signature') {
    throw new Error('Sampled content signature is missing or invalid.');
  }
  for (const field of ['profileVersion', 'sampleDigest', 'streamMetadataDigest', 'codec']) {
    if (typeof signature[field] !== 'string' || !signature[field]) {
      throw new Error(`Sampled content signature is missing ${field}.`);
    }
  }
  for (const field of ['sourceBytes', 'durationUs', 'streamIndex', 'sampledPacketCount']) {
    if (!Number.isSafeInteger(signature[field]) || signature[field] < 0) {
      throw new Error(`Sampled content signature has invalid ${field}.`);
    }
  }
  if (!Array.isArray(signature.ranges) || signature.ranges.length === 0) {
    throw new Error('Sampled content signature has no ranges.');
  }
  let previousEnd = -1;
  for (const range of signature.ranges) {
    if (!Number.isSafeInteger(range.startUs) || !Number.isSafeInteger(range.endUs) ||
        range.startUs < 0 || range.endUs <= range.startUs || range.startUs < previousEnd) {
      throw new Error('Sampled content signature contains an invalid or overlapping range.');
    }
    previousEnd = range.endUs;
  }
  return signature;
}

export function buildSampledPreparationIdentity(signature, compatibility) {
  assertSampledContentSignature(signature);
  for (const field of ['bestSourceVersion', 'ffmpegVersion', 'indexingOptions']) {
    if (compatibility?.[field] === undefined || compatibility[field] === null) {
      throw new Error(`Preparation compatibility is missing ${field}.`);
    }
  }
  return Object.freeze({
    sourceBytes: signature.sourceBytes,
    durationUs: signature.durationUs,
    sourceSampleDigest: signature.sampleDigest,
    streamMetadataDigest: signature.streamMetadataDigest,
    selectedTrack: signature.streamIndex,
    signatureProfileVersion: signature.profileVersion,
    preparationContractVersion: 'prepared-review-v2',
    bestSourceVersion: compatibility.bestSourceVersion,
    ffmpegVersion: compatibility.ffmpegVersion,
    indexingOptions: compatibility.indexingOptions,
  });
}

export function sampledContentSignaturesMatch(expected, observed) {
  try {
    assertSampledContentSignature(expected);
    assertSampledContentSignature(observed);
  } catch {
    return false;
  }
  return expected.profileVersion === observed.profileVersion &&
    expected.sourceBytes === observed.sourceBytes &&
    expected.durationUs === observed.durationUs &&
    expected.streamIndex === observed.streamIndex &&
    expected.codec === observed.codec &&
    expected.streamMetadataDigest === observed.streamMetadataDigest &&
    expected.sampleDigest === observed.sampleDigest &&
    JSON.stringify(expected.ranges) === JSON.stringify(observed.ranges);
}
