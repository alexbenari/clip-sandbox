import { describe, expect, it } from 'vitest';

import { REVIEW_PROXY_PROFILE_GOP_1 } from '../../src/preparation/all-intra-proxy-preparation.mjs';
import {
  buildBoundedSoftwareProxyArgs,
  buildQsvDecodeProxyArgs,
} from '../../src/preparation/ffmpeg-hardware-diagnostic.mjs';

describe('direct FFmpeg hardware diagnostic', () => {
  it('bounds the unchanged software recipe without changing its selected artifact contract', () => {
    const args = buildBoundedSoftwareProxyArgs(
      'input.mkv', 'output.mkv', REVIEW_PROXY_PROFILE_GOP_1, 2,
      { startSeconds: 600, durationSeconds: 60, sourceCodec: 'hevc', targetWidth: 960, targetHeight: 402 },
    );

    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2)).toEqual(['-ss', '600']);
    expect(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2)).toEqual(['-t', '60']);
    expect(args).toContain('mpeg4');
    expect(args).toContain('0:a:2?');
    expect(args).toContain('passthrough');
  });

  it('uses QSV only for decode and scale before the selected software MPEG-4 encoder', () => {
    const args = buildQsvDecodeProxyArgs(
      'input.mkv', 'output.mkv', REVIEW_PROXY_PROFILE_GOP_1, 0,
      {
        startSeconds: 600,
        durationSeconds: 60,
        sourceCodec: 'hevc',
        targetWidth: 960,
        targetHeight: 402,
      },
    );

    expect(args).toContain('qsv');
    expect(args).toContain('qsv=hw,child_device_type=dxva2');
    expect(args).toContain('hevc_qsv');
    const filter = args[args.indexOf('-vf') + 1];
    expect(filter).toContain('scale_qsv=w=960:h=402:format=nv12');
    expect(filter).toContain('hwdownload');
    expect(args).toContain('mpeg4');
    expect(args).not.toContain('h264_qsv');
    expect(args).toContain('aac');
  });
});
