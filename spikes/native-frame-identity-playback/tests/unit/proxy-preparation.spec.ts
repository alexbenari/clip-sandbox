import { describe, expect, it } from 'vitest';

import {
  REVIEW_PROXY_PROFILE_GOP_1,
  REVIEW_PROXY_PROFILE_GOP_6,
  REVIEW_PROXY_PROFILE_GOP_12,
  buildProxyEncodingArgs,
  buildProxyPreparationIdentity,
  selectPreviewAudioStream,
} from '../../src/preparation/all-intra-proxy-preparation.mjs';

const profiles = [
  REVIEW_PROXY_PROFILE_GOP_1,
  REVIEW_PROXY_PROFILE_GOP_6,
  REVIEW_PROXY_PROFILE_GOP_12,
];

describe('Phase 3B review-proxy contract', () => {
  it('exports GOP 1, 6, and 12 profiles without B-frames and gives each a distinct cache identity', () => {
    expect(profiles.map((profile) => profile.gopSize)).toEqual([1, 6, 12]);
    expect(profiles.every((profile) => profile.bFrames === 0)).toBe(true);
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(3);

    const canonical = { cacheKey: 'a'.repeat(64), numFrames: 42 };
    const compatibility = { bestSourceVersion: 'r1', ffmpegVersion: '9.1' };
    const identities = profiles.map((profile) =>
      buildProxyPreparationIdentity(canonical, profile, compatibility),
    );

    expect(new Set(identities.map((identity) => JSON.stringify(identity))).size).toBe(3);
    expect(identities.every((identity) => identity.canonicalCacheKey === canonical.cacheKey)).toBe(true);
  });

  it('preserves source-relative timing and requests monotonic duplicate/backward timestamp repair', () => {
    const args = buildProxyEncodingArgs('input.nut', 'proxy.mkv', REVIEW_PROXY_PROFILE_GOP_6);
    const filter = args[args.indexOf('-vf') + 1];

    expect(filter).toContain('scale=w=\'min(960,iw)\':h=-2');
    expect(filter).not.toContain('N*1000/FRAME_RATE');
    expect(filter).toContain('PTS-STARTPTS');
    expect(args).toContain('-fps_mode');
    expect(args).toContain('passthrough');
    expect(args).toContain('-fflags');
    expect(args).toContain('+genpts');
    expect(REVIEW_PROXY_PROFILE_GOP_6.timing).toBe('source-relative-monotonic');
  });

  it('maps one explicitly selected audio stream and normalizes it to stereo AAC at 192k', () => {
    const args = buildProxyEncodingArgs('input.nut', 'proxy.mkv', REVIEW_PROXY_PROFILE_GOP_6, 2);

    expect(args).toContain('0:a:2?');
    expect(args).not.toContain('0:a?');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-b:a');
    expect(args).toContain('192k');
    expect(args).toContain('-ac');
    expect(args).toContain('2');
    expect(args).not.toContain('copy');
    expect(REVIEW_PROXY_PROFILE_GOP_6.audio).toMatchObject({
      codec: 'aac',
      channels: 2,
      bitrate: 192000,
    });
  });

  it('prefers a main stereo program over surround and commentary tracks', () => {
    const selected = selectPreviewAudioStream([
      { index: 1, codec_name: 'dts', channels: 6, disposition: { default: 1 }, tags: { language: 'eng' } },
      { index: 2, codec_name: 'ac3', channels: 2, disposition: { default: 0 }, tags: { language: 'eng' } },
      { index: 3, codec_name: 'aac', channels: 2, disposition: { default: 0, comment: 1 },
        tags: { language: 'eng', title: 'Commentary' } },
    ]);

    expect(selected).toMatchObject({ audioOrdinal: 1, streamIndex: 2, codec: 'ac3', channels: 2 });
  });

  it.each([
    [{ ...REVIEW_PROXY_PROFILE_GOP_6, gopSize: 5 }, 'GOP size'],
    [{ ...REVIEW_PROXY_PROFILE_GOP_6, gopSize: 6, bFrames: 1 }, 'B-frames'],
  ])('rejects invalid %s profiles', (profile) => {
    expect(() => buildProxyEncodingArgs('input.nut', 'proxy.mkv', profile)).toThrow();
  });
});
