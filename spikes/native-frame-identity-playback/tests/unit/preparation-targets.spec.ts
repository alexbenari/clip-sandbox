import { describe, expect, it } from 'vitest';

import { selectPreparationTargets } from '../../src/preparation/preparation-targets.mjs';

describe('preparation evidence targets', () => {
  it('takes every normalization result, fixed diagnostics, fixtures, and one healthy control', () => {
    const policies = [
      { id: 'media-001', action: 'use-source' },
      { id: 'media-018', action: 'normalize-timestamps' },
      { id: 'media-041', action: 'normalize-timestamps' },
      { id: 'media-026', action: 'use-source' },
      { id: 'media-035', action: 'use-source' },
      { id: 'media-036', action: 'use-source' },
    ];
    const inventory = {
      groups: policies.map(({ id }) => ({ id, representativePath: `${id}.mkv` })),
      files: policies.map(({ id }) => ({
        path: `${id}.mkv`, durationSeconds: id === 'media-001' ? 5_000 : 100,
        width: 1280, height: 720, videoCodec: 'h264',
      })),
    };

    const targets = selectPreparationTargets(policies, inventory, [{
      id: 'fixture-cfr', sourcePath: 'fixture.mkv', kind: 'fixture',
    }]);

    expect(targets.map((target: { id: string }) => target.id)).toEqual([
      'media-018', 'media-041', 'media-026', 'media-035', 'media-036',
      'fixture-cfr', 'media-001',
    ]);
  });
});
