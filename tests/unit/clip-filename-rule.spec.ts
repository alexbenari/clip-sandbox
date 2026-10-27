// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ClipFilenameRule } = require('../../electron/clip-filename-rule.cjs');

describe('ClipFilenameRule', () => {
  const rule = new ClipFilenameRule();

  it('accepts a video file name with no folder', () => {
    expect(rule.isPlainVideoFilename('Sample Feature-001.mp4')).toBe(true);
  });

  it.each([
    ['a name with a folder', 'nested/clip.mp4'],
    ['a name with a Windows folder', 'nested\\clip.mp4'],
    ['the parent folder', '..'],
    ['a file that is not a video', 'notes.txt'],
    ['a value that is not text', 7],
  ])('refuses %s', (_scenario, filename) => {
    expect(rule.isPlainVideoFilename(filename)).toBe(false);
  });
});
