import { describe, expect, it } from 'vitest';

import {
  PreparationStateMachine,
  selectPreparationPolicy,
} from '../../src/preparation/preparation-policy.mjs';

describe('prepared review policy', () => {
  it('normalizes when no key packet has a presentation timestamp', () => {
    expect(selectPreparationPolicy({
      type: 'packet-scan',
      codec: 'mpeg4',
      packetCount: 100,
      keyPacketCount: 4,
      keyPacketsWithPts: 0,
      packetsWithMultipleVops: 12,
      divxPackedMarkerSeen: true,
    })).toMatchObject({
      action: 'normalize-timestamps',
      normalizationContainer: 'matroska',
      packedBFrameDiagnosticRecommended: true,
      usesPackedBFrameFilter: false,
    });
  });

  it('uses NUT when H.264 timestamp repair must preserve packet framing', () => {
    expect(selectPreparationPolicy({
      type: 'packet-scan',
      codec: 'h264',
      packetCount: 100,
      keyPacketCount: 4,
      keyPacketsWithPts: 0,
    })).toMatchObject({
      action: 'normalize-timestamps',
      normalizationContainer: 'nut',
      usesPackedBFrameFilter: false,
    });
  });

  it('keeps the source when at least one usable key-packet timestamp exists', () => {
    expect(selectPreparationPolicy({
      type: 'packet-scan',
      codec: 'mpeg4',
      packetCount: 100,
      keyPacketCount: 4,
      keyPacketsWithPts: 1,
      packetsWithMultipleVops: 0,
      divxPackedMarkerSeen: false,
    })).toMatchObject({
      action: 'use-source',
      reason: 'usable-key-packet-pts',
      normalizationContainer: null,
      usesPackedBFrameFilter: false,
    });
  });

  it('does not select unpacking for confirmed packed pictures with usable timestamps', () => {
    expect(selectPreparationPolicy({
      type: 'packet-scan',
      codec: 'mpeg4',
      packetCount: 100,
      keyPacketCount: 4,
      keyPacketsWithPts: 4,
      packetsWithMultipleVops: 20,
      divxPackedMarkerSeen: true,
    })).toMatchObject({
      action: 'use-source',
      packedBFrameDiagnosticRecommended: true,
      usesPackedBFrameFilter: false,
    });
  });

  it('guards exact operations until the complete index is published', () => {
    const state = new PreparationStateMachine();

    expect(() => state.assertExactReady()).toThrow('not exact-ready');
    state.begin();
    expect(() => state.assertExactReady()).toThrow('not exact-ready');
    state.publishReady({ reviewAsset: 'movie.mkv', index: 'movie.bsindex' });

    expect(state.assertExactReady()).toEqual({
      reviewAsset: 'movie.mkv',
      index: 'movie.bsindex',
    });
  });
});
