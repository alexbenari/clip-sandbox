// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { FolderEntries } = createRequire(import.meta.url)('../../electron/folder-entries.cjs');

describe('FolderEntries', () => {
  let folder: string;

  beforeEach(() => { folder = mkdtempSync(path.join(os.tmpdir(), 'clip-folder-entry-')); });
  afterEach(() => { rmSync(folder, { recursive: true, force: true }); });

  it('gives a file replaced under the same name a new media address that still plays that file', async () => {
    const clip = path.join(folder, 'Sample Clip #1.mp4');
    writeFileSync(clip, 'original');
    utimesSync(clip, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const before = await new FolderEntries().entry(clip);
    writeFileSync(clip, 'refined');
    utimesSync(clip, new Date(1_700_000_060_000), new Date(1_700_000_060_000));

    const after = await new FolderEntries().entry(clip);

    expect(after.mediaSource).not.toBe(before.mediaSource);
    expect([before.mediaSource, after.mediaSource].map(address => fileURLToPath(address))).toEqual([clip, clip]);
  });

  it('lists only the files directly in the folder', async () => {
    writeFileSync(path.join(folder, 'one.mp4'), 'clip');
    mkdirSync(path.join(folder, 'nested'));
    writeFileSync(path.join(folder, 'nested', 'two.mp4'), 'clip');

    const entries = await new FolderEntries().read(folder);

    expect(entries.map((entry: { name: string }) => entry.name)).toEqual(['one.mp4']);
  });

  it('carries the text of a collection file in its entry', async () => {
    writeFileSync(path.join(folder, 'Favourites.txt'), 'one.mp4\ntwo.mp4');

    const [entry] = await new FolderEntries().read(folder);

    expect(entry).toMatchObject({ name: 'Favourites.txt', type: 'text/plain', text: 'one.mp4\ntwo.mp4' });
  });
});
