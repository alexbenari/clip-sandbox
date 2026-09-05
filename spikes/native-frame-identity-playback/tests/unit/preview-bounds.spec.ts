import { describe, expect, it } from 'vitest';

import { previewBoundsFields } from '../../src/adapter/frame-playback-adapter.js';

describe('preview bounds', () => {
  it('encodes a bounded viewport for the native services', () => {
    expect(previewBoundsFields({ maxWidth: 1280, maxHeight: 800 })).toEqual({
      maxPreviewWidth: 1280,
      maxPreviewHeight: 800,
    });
  });

  it('rejects dimensions whose RGBA buffer could exceed the protocol payload limit', () => {
    expect(() => previewBoundsFields({ maxWidth: 16_384, maxHeight: 16_384 }))
      .toThrow('Preview bounds exceed the native bridge payload limit.');
  });
});
