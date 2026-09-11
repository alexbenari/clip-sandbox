// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { VideoEditCatalog } from '../../src/business-logic/video-edit-catalog.js';

describe('VideoEditCatalog', () => {
  const catalog = new VideoEditCatalog();

  test('exposes the v1 zoom edit catalog entry', () => {
    expect(catalog.listZoomEdits()).toHaveLength(1);
    expect(catalog.findById('loopify')).toMatchObject({
      id: 'loopify',
      label: 'Loopify',
      filenameSuffix: 'looped',
      availability: 'zoom',
    });
  });

  test('derives preferred output filenames as mp4 files', () => {
    expect(catalog.preferredOutputFilename({ sourceName: 'alpha.mov', editId: 'loopify' })).toBe('alpha-looped.mp4');
    expect(catalog.preferredOutputFilename({ sourceName: 'alpha', editId: 'loopify' })).toBe('alpha-looped.mp4');
    expect(catalog.preferredOutputFilename({ sourceName: '', editId: 'loopify' })).toBe('');
  });
});

