import { describe, expect, test } from 'vitest';
import { LoadStatusText } from '../../src/app/load-status-text.js';
import { AppText } from '../../src/app/app-text.js';

const text = new LoadStatusText(new AppText());

describe('load status text', () => {
  test('describes a loaded pipeline or collection with its clip count', () => {
    expect(text.selectionLoaded(true, 1)).toBe('Loaded pipeline with 1 clip.');
    expect(text.selectionLoaded(false, 2)).toBe('Loaded collection with 2 clips.');
  });
});
