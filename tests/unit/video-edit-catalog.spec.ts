// @ts-nocheck
import { describe, expect, test } from 'vitest';
import {
  getVideoEditById,
  listZoomVideoEdits,
  preferredVideoEditFilename,
} from '../../src/business-logic/video-edit-catalog.js';

describe('video edit catalog', () => {
  test('exposes the v1 zoom edit catalog entry', () => {
    expect(listZoomVideoEdits()).toHaveLength(1);
    expect(getVideoEditById('loopify')).toMatchObject({
      id: 'loopify',
      label: 'Loopify',
      filenameSuffix: 'looped',
      availability: 'zoom',
    });
  });

  test('derives preferred output filenames as mp4 files', () => {
    expect(preferredVideoEditFilename({ sourceName: 'alpha.mov', editId: 'loopify' })).toBe('alpha-looped.mp4');
    expect(preferredVideoEditFilename({ sourceName: 'alpha', editId: 'loopify' })).toBe('alpha-looped.mp4');
    expect(preferredVideoEditFilename({ sourceName: '', editId: 'loopify' })).toBe('');
  });
});

