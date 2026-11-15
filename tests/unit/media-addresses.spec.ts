// @vitest-environment node
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { MediaAddresses } = createRequire(import.meta.url)('../../electron/media-addresses.cjs');

describe('MediaAddresses', () => {
  const mediaAddresses = new MediaAddresses();
  const clip = path.join(os.tmpdir(), 'Sample Clip #1.mp4');

  it('gives a file replaced under the same name a new address that still plays that file', () => {
    const before = mediaAddresses.address(clip, 1_700_000_000_000);
    const after = mediaAddresses.address(clip, 1_700_000_060_000);

    expect(after).not.toBe(before);
    expect([before, after].map(address => fileURLToPath(address))).toEqual([clip, clip]);
  });

  it('keeps the address of an unchanged file', () => {
    expect(mediaAddresses.address(clip, 1_700_000_000_000)).toBe(mediaAddresses.address(clip, 1_700_000_000_000));
  });
});
