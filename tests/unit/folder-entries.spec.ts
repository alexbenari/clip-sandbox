// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { FolderEntries } = require('../../electron/folder-entries.cjs');
const { MediaAddresses } = require('../../electron/media-addresses.cjs');

describe('FolderEntries', () => {
  let folder: string;

  beforeEach(() => { folder = mkdtempSync(path.join(os.tmpdir(), 'clip-folder-entry-')); });
  afterEach(() => { rmSync(folder, { recursive: true, force: true }); });

  it('addresses an entry by its file version', async () => {
    const clip = path.join(folder, 'Sample Clip #1.mp4');
    writeFileSync(clip, 'clip');
    utimesSync(clip, new Date(1_700_000_000_000), new Date(1_700_000_000_000));

    const entry = await new FolderEntries().entry(clip);

    expect(entry.mediaSource).toBe(new MediaAddresses().address(clip, 1_700_000_000_000));
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
