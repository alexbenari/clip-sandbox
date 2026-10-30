// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceMovieFixture, sourceMovieTag } from '../support/source-movie-fixtures.js';

const require = createRequire(import.meta.url);
const { ClipSourceMovieRuntime } = require('../../electron/clip-source-movie-runtime.cjs');
const { Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');

const taggedMovieFileName = JSON.parse(sourceMovieTag.value).sourceMovie.displayName;
const event = { sender: { id: 1 } };

describe('ClipSourceMovieRuntime', () => {
  let grantedFolder = '';

  beforeEach(async () => {
    grantedFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-source-movies-'));
    await fs.copyFile(sourceMovieFixture('tagged.mp4'), path.join(grantedFolder, 'tagged.mp4'));
    await fs.copyFile(sourceMovieFixture('untagged.mp4'), path.join(grantedFolder, 'untagged.mp4'));
    await fs.copyFile(sourceMovieFixture('tagged.mp4'), path.join(grantedFolder, 'tagged-copy.webm'));
    await fs.copyFile(sourceMovieFixture('tagged-v2-single-reference.mp4'), path.join(grantedFolder, 'tagged-v2.mp4'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(grantedFolder, { recursive: true, force: true });
  });

  const folderAccess = {
    requireKnownPath: (_sender: unknown, folderPath: unknown) => {
      if (folderPath !== grantedFolder) throw new Error('Folder access is unavailable for this folder session.');
      return grantedFolder;
    },
  };

  it('answers each clip with its source movie from either record version, none, or unreadable, in request order', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = new ClipSourceMovieRuntime({ folderAccess });

    const answer = await runtime.read(event, {
      folderPath: grantedFolder,
      filenames: ['untagged.mp4', 'tagged.mp4', 'missing.mp4', 'tagged-copy.webm', 'tagged-v2.mp4'],
    });

    expect(answer).toEqual({ clips: [
      { filename: 'untagged.mp4', kind: 'none' },
      { filename: 'tagged.mp4', kind: 'movie', movieFileName: taggedMovieFileName },
      { filename: 'missing.mp4', kind: 'unreadable' },
      { filename: 'tagged-copy.webm', kind: 'none' },
      { filename: 'tagged-v2.mp4', kind: 'movie', movieFileName: taggedMovieFileName },
    ] });
  });

  it('answers a clip whose record keeps only the movie with that movie', async () => {
    const { sourceMovie } = JSON.parse(sourceMovieTag.value);
    const tagReader = { read: async () => JSON.stringify({ provenanceVersion: 2, sourceMovie }) };
    const runtime = new ClipSourceMovieRuntime({ folderAccess, provenance: new Mp4Provenance({ tagReader }) });

    const answer = await runtime.read(event, { folderPath: grantedFolder, filenames: ['tagged.mp4'] });

    expect(answer).toEqual({ clips: [{ filename: 'tagged.mp4', kind: 'movie', movieFileName: taggedMovieFileName }] });
  });

  it('logs how many clips were unreadable without naming them', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = new ClipSourceMovieRuntime({ folderAccess });

    await runtime.read(event, { folderPath: grantedFolder, filenames: ['missing.mp4', 'tagged.mp4'] });

    expect(warn.mock.calls).toEqual([['[clip-source-movies] unreadable', { count: 1 }]]);
  });

  describe('refuses a request without reading any clip', () => {
    function runtimeWithReadSpy() {
      const read = vi.fn(async () => null);
      return { read, runtime: new ClipSourceMovieRuntime({ folderAccess, provenance: { canBeTagged: () => true, read } }) };
    }

    const invalidRequest = 'Clip source movie request is invalid.';

    it.each([
      ['a folder that was not opened in this window', { folderPath: 'D:\\elsewhere', filenames: ['tagged.mp4'] }, 'Folder access is unavailable for this folder session.'],
      ['a name that contains a folder', { filenames: ['nested/tagged.mp4'] }, invalidRequest],
      ['a name that contains a Windows folder', { filenames: ['nested\\tagged.mp4'] }, invalidRequest],
      ['a parent-folder name', { filenames: ['..'] }, invalidRequest],
      ['a name that is not a video', { filenames: ['notes.txt'] }, invalidRequest],
      ['a list that is not an array', { filenames: 'tagged.mp4' }, invalidRequest],
      ['more than 20,000 names', { filenames: Array.from({ length: 20_001 }, (_, index) => `clip-${index}.mp4`) }, invalidRequest],
    ])('%s', async (_scenario, request, message) => {
      const { read, runtime } = runtimeWithReadSpy();

      await expect(runtime.read(event, { folderPath: grantedFolder, ...request })).rejects.toThrow(message);

      expect(read).not.toHaveBeenCalled();
    });
  });
});
