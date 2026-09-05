import { describe, expect, it } from 'vitest';

import {
  createCodedRgbFrame,
  decodeFrameCodeFromRgba,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  rgbToRgba,
} from '../../src/tooling/frame-code.mjs';

describe('decoded fixture frame code', () => {
  it.each([0, 1, 37, 255, 4095])('identifies generated source frame %i exactly', (frameIndex) => {
    const rgba = rgbToRgba(createCodedRgbFrame(frameIndex));

    expect(decodeFrameCodeFromRgba(rgba, FRAME_WIDTH, FRAME_HEIGHT)).toBe(frameIndex);
  });

  it('rejects a damaged parity bit instead of returning a plausible frame', () => {
    const rgba = rgbToRgba(createCodedRgbFrame(37));
    const parityCellCenter = ((8 + 20 * 10 + 4) + (8 + 4) * FRAME_WIDTH) * 4;
    rgba[parityCellCenter] = rgba[parityCellCenter] === 255 ? 0 : 255;
    rgba[parityCellCenter + 1] = rgba[parityCellCenter];
    rgba[parityCellCenter + 2] = rgba[parityCellCenter];

    expect(() => decodeFrameCodeFromRgba(rgba, FRAME_WIDTH, FRAME_HEIGHT)).toThrow('parity');
  });
});

