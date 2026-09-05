import { describe, expect, it } from 'vitest';

import {
  assessRepairCandidate,
  buildRepairArgs,
  classifyPacketScan,
  compareSampledContent,
  repairLevelsFor,
} from '../../src/tooling/media-remediation.mjs';

describe('media remediation evaluation', () => {
  it('classifies key packets without presentation timestamps as a random-access risk', () => {
    expect(classifyPacketScan({
      codec: 'mpeg4',
      keyPacketCount: 12,
      keyPacketsWithPts: 0,
      packetsWithMultipleVops: 0,
      divxPackedMarkerSeen: false,
      packedBFramesDetected: false,
    })).toEqual({
      missingKeyPacketPts: true,
      packedBFramesDetected: false,
      packedBFrameStatus: 'none',
      divxPackedMarkerSeen: false,
      requiresTimestampNormalization: true,
      packedBFrameDiagnosticRecommended: false,
    });
  });

  it('treats a DivX packed marker without multi-VOP packets as a hint, not confirmed packing', () => {
    expect(classifyPacketScan({
      codec: 'mpeg4',
      keyPacketCount: 2,
      keyPacketsWithPts: 2,
      packetsWithMultipleVops: 0,
      divxPackedMarkerSeen: true,
      packedBFramesDetected: true,
    })).toMatchObject({
      packedBFramesDetected: false,
      packedBFrameStatus: 'marker-only',
      packedBFrameDiagnosticRecommended: false,
    });
  });

  it('recommends packed-picture diagnostics only from confirmed multi-VOP packets', () => {
    expect(classifyPacketScan({
      codec: 'mpeg4',
      keyPacketCount: 2,
      keyPacketsWithPts: 2,
      packetsWithMultipleVops: 4,
      divxPackedMarkerSeen: true,
    })).toMatchObject({
      packedBFramesDetected: true,
      packedBFrameStatus: 'confirmed',
      packedBFrameDiagnosticRecommended: true,
    });
  });

  it('includes packed-picture normalization only for MPEG-4 Part 2', () => {
    expect(repairLevelsFor({ codec: 'mpeg4' }).map((level: { id: string }) => level.id)).toEqual([
      'timestamp-remux',
      'unpack-only-remux',
      'unpack-and-timestamp-remux',
      'all-intra-proxy',
    ]);
    expect(repairLevelsFor({ codec: 'h264' }).map((level: { id: string }) => level.id)).toEqual([
      'timestamp-remux',
      'all-intra-proxy',
    ]);
  });

  it('keeps each MPEG-4 repair level mechanically distinct', () => {
    const timestamp = buildRepairArgs('timestamp-remux', 'input.avi', 'timestamp.mkv');
    const unpack = buildRepairArgs('unpack-only-remux', 'input.avi', 'unpacked.avi');
    const combined = buildRepairArgs('unpack-and-timestamp-remux', 'input.avi', 'combined.mkv');
    const proxy = buildRepairArgs('all-intra-proxy', 'input.avi', 'proxy.mkv');

    expect(timestamp).toContain('+genpts');
    expect(timestamp).not.toContain('mpeg4_unpack_bframes');
    expect(unpack).toContain('mpeg4_unpack_bframes');
    expect(unpack).not.toContain('+genpts');
    expect(combined).toContain('+genpts');
    expect(combined).toContain('mpeg4_unpack_bframes');
    expect(proxy).toContain('-vf');
    expect(proxy).toContain('-g');
    expect(proxy.find((argument: string) => argument.includes('setpts='))).toContain('N*1000/FRAME_RATE');
    expect(proxy).toContain('-enc_time_base:v');
    expect(proxy).not.toContain('mpeg4_unpack_bframes');
  });

  it('compares stream-copy candidates by frame count and sampled decoded pixels, not changed PTS', () => {
    const baseline = {
      numFrames: 3,
      frames: [
        { requestedFrame: 0, rgbaHash: 'a' },
        { requestedFrame: 2, rgbaHash: 'c' },
      ],
    };
    const candidate = {
      numFrames: 3,
      frames: [
        { requestedFrame: 0, rgbaHash: 'a', pts: '100' },
        { requestedFrame: 2, rgbaHash: 'c', pts: '180' },
      ],
    };

    expect(compareSampledContent(baseline, candidate)).toEqual({
      frameCountPreserved: true,
      sampledPixelsPreserved: true,
      comparedFrames: 2,
    });
  });

  it('requires usable keyframe PTS, preserved content, and successful exact access', () => {
    expect(assessRepairCandidate({
      content: { frameCountPreserved: true, sampledPixelsPreserved: true },
      keyframeCount: 20,
      ptsUsableKeyframeCount: 20,
      probeCompleted: true,
      warmP95Ms: 25,
      requirePixelIdentity: true,
    })).toEqual({
      usableSeekPoints: true,
      identityPass: true,
      exactAccessPass: true,
      warmAccessPass: true,
      viable: true,
    });
  });
});
