// @vitest-environment node
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { createFolderEntry } = createRequire(import.meta.url)('../../electron/folder-entry.cjs');

describe('folder entries', () => {
  let folder: string;

  beforeEach(() => { folder = mkdtempSync(path.join(os.tmpdir(), 'clip-folder-entry-')); });
  afterEach(() => { rmSync(folder, { recursive: true, force: true }); });

  it('give a file replaced under the same name a new media address that still plays that file', async () => {
    const clip = path.join(folder, 'Sample Clip #1.mp4');
    writeFileSync(clip, 'original');
    utimesSync(clip, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const before = await createFolderEntry(clip);
    writeFileSync(clip, 'refined');
    utimesSync(clip, new Date(1_700_000_060_000), new Date(1_700_000_060_000));

    const after = await createFolderEntry(clip);

    expect(after.mediaSource).not.toBe(before.mediaSource);
    expect([before.mediaSource, after.mediaSource].map(address => fileURLToPath(address))).toEqual([clip, clip]);
  });
});
