import { describe, expect, it } from 'vitest';

import { createMediaScope } from '../../src/tooling/media-scope.mjs';

const config = {
  schemaVersion: 1,
  excludedFiles: ['family/phone.mov'],
  excludedDirectories: ['watch/rame'],
};

describe('media scope', () => {
  it('excludes the configured file and every file below an excluded directory', () => {
    const scope = createMediaScope('D:\\media', config);

    expect(scope.includes('D:\\media\\family\\phone.mov')).toBe(false);
    expect(scope.includes('D:\\media\\watch\\rame\\nested\\movie.mkv')).toBe(false);
    expect(scope.includes('D:\\media\\watch\\target-movie.mkv')).toBe(true);
  });

  it('rejects an exclusion that escapes the media root', () => {
    expect(() => createMediaScope('D:\\media', {
      ...config,
      excludedDirectories: ['..\\private'],
    })).toThrow('escapes the media root');
  });
});
