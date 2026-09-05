import { describe, expect, it } from 'vitest';

import {
  chooseProxyAcceleration,
  proxyTargetSize,
} from '../../src/preparation/proxy-acceleration-policy.mjs';

describe('review proxy acceleration policy', () => {
  it('selects QSV only for the measured expensive HEVC class', () => {
    expect(chooseProxyAcceleration({
      codec: 'hevc', width: 3840, height: 1606, pixelFormat: 'yuv420p10le',
    })).toMatchObject({ backend: 'qsv-decode-scale', reason: 'large-hevc' });

    expect(chooseProxyAcceleration({
      codec: 'h264', width: 1920, height: 1080, pixelFormat: 'yuv420p',
    })).toMatchObject({ backend: 'software', reason: 'qsv-not-beneficial-for-source-class' });
    expect(chooseProxyAcceleration({
      codec: 'hevc', width: 1280, height: 720, pixelFormat: 'yuv420p',
    })).toMatchObject({ backend: 'software', reason: 'qsv-not-beneficial-for-source-class' });
  });

  it('calculates even proxy dimensions without exceeding the accepted 960-pixel width', () => {
    expect(proxyTargetSize({ width: 3840, height: 1606 }, 960)).toEqual({ width: 960, height: 402 });
    expect(proxyTargetSize({ width: 640, height: 359 }, 960)).toEqual({ width: 640, height: 360 });
  });
});
