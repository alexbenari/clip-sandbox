import { describe, expect, it } from 'vitest';

import { describeMediaProbe, selectRepresentative } from '../../src/tooling/media-signature.mjs';

function probe(overrides = {}) {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5' },
    streams: [{
      codec_type: 'video', codec_name: 'h264', profile: 'High', pix_fmt: 'yuv420p',
      width: 1920, height: 1080, r_frame_rate: '24000/1001', avg_frame_rate: '24000/1001',
      field_order: 'progressive',
    }, { codec_type: 'audio', codec_name: 'aac' }],
    ...overrides,
  };
}

describe('media signature', () => {
  it('groups equivalent files independently of container alias order', () => {
    const first = describeMediaProbe('first.mp4', 100, probe());
    const secondProbe = probe();
    secondProbe.format.format_name = 'mj2,3g2,3gp,m4a,mp4,mov';
    const second = describeMediaProbe('second.mp4', 200, secondProbe);

    expect(first.signature).toBe(second.signature);
  });

  it('separates materially different pixel formats', () => {
    const eightBit = describeMediaProbe('eight.mp4', 100, probe());
    const tenBitProbe = probe();
    tenBitProbe.streams[0].pix_fmt = 'yuv420p10le';
    const tenBit = describeMediaProbe('ten.mp4', 100, tenBitProbe);

    expect(eightBit.signature).not.toBe(tenBit.signature);
  });

  it('records audio without multiplying exact-frame signatures', () => {
    const aac = describeMediaProbe('aac.mp4', 100, probe());
    const pcmProbe = probe();
    pcmProbe.streams[1].codec_name = 'pcm_s16le';
    const pcm = describeMediaProbe('pcm.mp4', 100, pcmProbe);

    expect(aac.audioCodecs).not.toEqual(pcm.audioCodecs);
    expect(aac.signature).toBe(pcm.signature);
  });

  it('does not split a signature for insignificant frame-rate rounding', () => {
    const exactProbe = probe();
    exactProbe.streams[0].r_frame_rate = '25/1';
    exactProbe.streams[0].avg_frame_rate = '25/1';
    const exact = describeMediaProbe('exact.mp4', 100, exactProbe);
    const roundedProbe = probe();
    roundedProbe.streams[0].r_frame_rate = '25/1';
    roundedProbe.streams[0].avg_frame_rate = '1541643750/61666273';
    const rounded = describeMediaProbe('rounded.mp4', 100, roundedProbe);

    expect(rounded.rateClass).toBe('cfr');
    expect(rounded.signature).toBe(exact.signature);
  });

  it('still separates materially different reported rates', () => {
    const mismatchedProbe = probe();
    mismatchedProbe.streams[0].r_frame_rate = '25/1';
    mismatchedProbe.streams[0].avg_frame_rate = '24000/1001';

    const mismatched = describeMediaProbe('mismatched.mp4', 100, mismatchedProbe);

    expect(mismatched.rateClass).toBe('rate-mismatch');
  });

  it('treats a zero-valued reported rate as unknown', () => {
    const zeroRateProbe = probe();
    zeroRateProbe.streams[0].avg_frame_rate = '0/1';

    const zeroRate = describeMediaProbe('zero-rate.mp4', 100, zeroRateProbe);

    expect(zeroRate.rateClass).toBe('unknown');
  });

  it('excludes attached cover art from playable video tracks', () => {
    const withCover = probe() as any;
    withCover.streams.unshift({
      codec_type: 'video', codec_name: 'mjpeg', profile: 'Baseline', pix_fmt: 'yuvj420p',
      width: 1280, height: 720, disposition: { attached_pic: 1 },
    });

    const described = describeMediaProbe('movie.mkv', 100, withCover);

    expect(described.videoCodec).toBe('h264');
    expect(described.videoTrackCount).toBe(1);
  });

  it('rejects an audio file whose only video stream is attached cover art', () => {
    const coverOnly = probe({
      streams: [{
        codec_type: 'video', codec_name: 'mjpeg', width: 1280, height: 720,
        disposition: { attached_pic: 1 },
      }, { codec_type: 'audio', codec_name: 'aac' }],
    });

    expect(() => describeMediaProbe('audio-with-cover.mkv', 100, coverOnly))
      .toThrow('No playable video stream');
  });

  it('selects the more demanding representative from one signature', () => {
    const short = describeMediaProbe('short.mp4', 1_000, probe());
    const longProbe = probe();
    longProbe.format.duration = '7200';
    const long = describeMediaProbe('long.mp4', 5_000_000, longProbe);

    expect(selectRepresentative([short, long]).path).toBe('long.mp4');
  });
});
