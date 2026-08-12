import { describe, expect, it } from 'vitest';

import { assertVideoTrackCanDecode } from '../src/candidates/mediabunny/video-decode-preflight';

describe('Candidate B video decode preflight', () => {
  it('allows a video track that the current WebCodecs environment can decode', async () => {
    await expect(
      assertVideoTrackCanDecode({
        canDecode: async () => true,
        getCodecParameterString: async () => 'avc1.64001f',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an unsupported video track with its codec in the error', async () => {
    await expect(
      assertVideoTrackCanDecode({
        canDecode: async () => false,
        getCodecParameterString: async () => 'mp4v.20.3',
      }),
    ).rejects.toThrow('mp4v.20.3');
  });
});
