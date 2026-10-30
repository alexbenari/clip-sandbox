// @vitest-environment node
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ClipFileRenamer } = require('../../electron/clip-file-renamer.cjs');

const sender = { id: 3 };
let folder = '';

function renamer() {
  const folderAccess = {
    requireKnownPath: (_sender: unknown, folderPath: unknown) => {
      if (folderPath !== folder) throw new Error('Folder access is unavailable for this folder session.');
      return folder;
    },
  };
  return new ClipFileRenamer({ folderAccess });
}

const rename = (filename: string, newFilename: unknown, folderPath = folder) =>
  renamer().rename(sender, { folderPath, filename, newFilename });

describe('ClipFileRenamer', () => {
  beforeEach(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), 'clip-renamer-'));
    await writeFile(path.join(folder, 'alpha.mp4'), 'alpha');
    await writeFile(path.join(folder, 'bravo.mp4'), 'bravo');
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('renames the clip and answers the folder entry of its new name', async () => {
    const answer = await rename('alpha.mp4', 'sunset.mp4');

    expect(answer).toMatchObject({ kind: 'renamed', entry: { name: 'sunset.mp4', path: path.join(folder, 'sunset.mp4') } });
    expect((await readdir(folder)).sort()).toEqual(['bravo.mp4', 'sunset.mp4']);
    expect(await readFile(path.join(folder, 'sunset.mp4'), 'utf8')).toBe('alpha');
  });

  it('renames a clip to the same name in another case', async () => {
    const answer = await rename('alpha.mp4', 'Alpha.mp4');

    expect(answer).toMatchObject({ kind: 'renamed', entry: { name: 'Alpha.mp4' } });
    expect((await readdir(folder)).sort()).toEqual(['Alpha.mp4', 'bravo.mp4']);
  });

  it.each([
    ['another clip', 'bravo.mp4'],
    ['another clip in another case', 'BRAVO.mp4'],
  ])('refuses the name of %s and leaves both files', async (_case, newFilename) => {
    const answer = await rename('alpha.mp4', newFilename);

    expect(answer).toEqual({ kind: 'refused', reason: 'name-taken' });
    expect(await readFile(path.join(folder, 'alpha.mp4'), 'utf8')).toBe('alpha');
    expect(await readFile(path.join(folder, 'bravo.mp4'), 'utf8')).toBe('bravo');
  });

  it('refuses the name of a folder', async () => {
    await mkdir(path.join(folder, 'charlie.mp4'));

    expect(await rename('alpha.mp4', 'charlie.mp4')).toEqual({ kind: 'refused', reason: 'name-taken' });
  });

  it.each([
    ['another extension', 'alpha.mkv'],
    ['no extension', 'alpha'],
    ['a folder in the name', 'sub\\alpha.mp4'],
    ['a character Windows forbids', 'al:pha.mp4'],
    ['a name ending in a dot', 'alpha..mp4'],
    ['a name of spaces', '   .mp4'],
    ['a leading space', ' alpha2.mp4'],
    ['a reserved device name', 'con.mp4'],
    ['no name at all', undefined],
  ])('refuses %s as an invalid name and keeps the clip', async (_case, newFilename) => {
    const answer = await rename('alpha.mp4', newFilename);

    expect(answer).toEqual({ kind: 'refused', reason: 'invalid-name' });
    expect((await readdir(folder)).sort()).toEqual(['alpha.mp4', 'bravo.mp4']);
  });

  it.each([
    ['a folder that was not granted', 'alpha.mp4', path.join(os.tmpdir(), 'elsewhere'), 'folder-not-open'],
    ['a clip that does not exist', 'delta.mp4', null, 'not-a-file'],
  ])('refuses %s', async (_case, filename, folderPath, reason) => {
    expect(await rename(filename, 'echo.mp4', folderPath ?? folder)).toEqual({ kind: 'refused', reason });
  });
});
