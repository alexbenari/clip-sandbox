// A 25 frames per second movie: movie frame n is shown at n × 40 ms and has check value n in hex.
export const FRAME_US = 40_000;

export function checkValue(movieFrame: number): string {
  return movieFrame.toString(16).padStart(16, '0');
}

export const sourceMovie = Object.freeze({
  displayName: 'Feature.mkv',
  fingerprint: Object.freeze({
    fingerprintVersion: 1, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '1000', sourceDurationUs: '7200000000',
    signatureProfileVersion: 'profile-1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
  }),
});
