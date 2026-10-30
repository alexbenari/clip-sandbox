// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLIP_SESSION, WINDOW_SESSION, event, stagedEditsIn, windowRequest } from '../support/staged-edit-fixtures.js';

const require = createRequire(import.meta.url);
const { StagedEditRefusal } = require('../../electron/staged-edit-resolver.cjs');

let root: string;
let folder: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'staged-edit-resolver-'));
  folder = path.join(root, 'picks');
  mkdirSync(folder);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function resolverFor(fixture: Parameters<typeof stagedEditsIn>[1] = {}) {
  const { stagedEdits, host, clipPath } = stagedEditsIn(folder, fixture);
  const resolve = (request: Record<string, unknown>) => stagedEdits.resolve(event, {
    folderPath: folder, filename: 'Feature-002.mp4', sessionId: CLIP_SESSION, source: { kind: 'clip' },
    startFrame: 5, endFrame: 45, loopify: false, ...request,
  });
  return { resolve, host, clipPath };
}

async function refusalOf(answer: Promise<unknown>) {
  const error = await answer.then(() => null, (thrown: unknown) => thrown);
  return error instanceof StagedEditRefusal ? { code: error.code, message: error.message } : error;
}

describe('StagedEditResolver', () => {
  describe('refusals', () => {
    it.each([
      ['a folder that was not opened in this window', { folderPath: path.resolve('elsewhere') }, 'Folder access is unavailable for this folder session.'],
      ['a name that contains a folder', { filename: '..\\Feature-002.mp4' }, 'Clip filename is invalid.'],
      ['a name that is not a video', { filename: 'notes.txt' }, 'Clip filename is invalid.'],
      ['a clip that is not in the folder', { filename: 'Feature-009.mp4' }, 'Clip is not a file.'],
      ['an end before the start', { startFrame: 10, endFrame: 9 }, 'The edit request is invalid.'],
      ['a Loopify flag that is not true or false', { loopify: 'yes' }, 'The edit request is invalid.'],
      ['a source that is neither the clip nor a window', { source: { kind: 'movie' } }, 'The edit request is invalid.'],
    ])('refuses %s before reading any source', async (_case, request, message) => {
      const { resolve, host } = resolverFor();

      const refusal = await refusalOf(resolve(request));

      expect([refusal, host.registerSource.mock.calls.length]).toEqual([{ code: 'invalid-request', message }, 0]);
    });

    it.each([
      ['a range past the clip’s last frame', { endFrame: 51 }, 'The range is outside the clip.'],
      ['a session that does not show the clip', { sessionId: WINDOW_SESSION }, 'The review session does not show this source.'],
      ['a window range starting more than a minute before the clip', { ...windowRequest, startFrame: 379, endFrame: 1900 }, 'The range reaches more than a minute beyond the clip.'],
      ['a window range ending more than a minute after the clip', { ...windowRequest, startFrame: 1900, endFrame: 3431 }, 'The range reaches more than a minute beyond the clip.'],
      ['a window that is not anchored', { ...windowRequest, source: { kind: 'window', windowId: 'window_opaque0002' }, startFrame: 1870, endFrame: 1940 }, 'The movie window is not anchored.'],
      ['a session that does not show the window', { ...windowRequest, sessionId: CLIP_SESSION, startFrame: 1870, endFrame: 1940 }, 'The review session does not show this source.'],
    ])('refuses %s', async (_case, request, message) => {
      const { resolve } = resolverFor();

      await expect(refusalOf(resolve(request))).resolves.toEqual({ code: 'invalid-request', message });
    });

    it('refuses the window of another clip', async () => {
      const { resolve } = resolverFor({ windowRecord: { clipPath: path.join(folder, 'Feature-003.mp4') } });

      await expect(refusalOf(resolve({ ...windowRequest, startFrame: 1870, endFrame: 1940 })))
        .resolves.toEqual({ code: 'invalid-request', message: 'The movie window belongs to another clip.' });
    });
  });

  describe('the staged edits', () => {
    it.each([
      ['a trim of the clip', { startFrame: 5, endFrame: 45 }, ['refine']],
      ['the whole clip', { startFrame: 0, endFrame: 50 }, []],
      ['the whole clip with Loopify', { startFrame: 0, endFrame: 50, loopify: true }, ['loopify']],
      ['an extension in the movie window', { ...windowRequest, startFrame: 1870, endFrame: 1940 }, ['refine']],
      ['the whole clip shown in its movie window', { ...windowRequest, startFrame: 1880, endFrame: 1930 }, []],
      ['a new end in the movie window with Loopify', { ...windowRequest, startFrame: 1880, endFrame: 1925, loopify: true }, ['refine', 'loopify']],
    ])('stages Refine only for a changed range and Loopify only when asked: %s', async (_case, request, edits) => {
      const { resolve } = resolverFor();

      const staged = await resolve(request);

      expect(staged.composition.edits).toEqual(edits);
    });
  });

  describe('the cut', () => {
    it('cuts a range of the clip from the clip itself', async () => {
      const { resolve, host, clipPath } = resolverFor();

      const { cut } = await resolve({ startFrame: 5, endFrame: 45 });

      expect((await host.prepareExtractionSource(cut.sourceHandle)).sourcePath).toBe(clipPath);
    });

    it('cuts a range of the movie window from the window', async () => {
      const { resolve } = resolverFor();

      const { cut } = await resolve({ ...windowRequest, startFrame: 1870, endFrame: 1940 });

      expect([cut.sourceHandle, cut.startFrame, cut.endFrame]).toEqual(['source_window01', 1870, 1940]);
    });
  });
});
