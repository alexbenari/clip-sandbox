// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceMovie, checkValue } from '../support/movie-window-fixtures.js';
import { CLIP_SESSION, WINDOW_PATH, WINDOW_SESSION, WINDOW_ID, clipRecord, endReferences, event, stagedEditsIn, windowRequest }
  from '../support/staged-edit-fixtures.js';

const require = createRequire(import.meta.url);
const { RefinedClipSaver } = require('../../electron/refined-clip-saver.cjs');
const { RefinedClipKeptUnderTemporaryName, RefinedClipPlacement } = require('../../electron/refined-clip-placement.cjs');

let root: string;
let folder: string;
let recycleBin: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'refined-clip-saver-'));
  folder = path.join(root, 'picks');
  recycleBin = path.join(root, 'recycle-bin');
  mkdirSync(folder);
  mkdirSync(recycleBin);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function saverFor({ clipName = 'Feature-002.mp4', sourceInfo = clipRecord() as unknown, windowRecord = {} as object,
  moviePrepared = false, placement = undefined as object | undefined,
  encode = undefined as ((request: Record<string, any>) => Promise<unknown>) | undefined } = {}) {
  const { stagedEdits, host, clipPath, provenance } = stagedEditsIn(folder, { clipName, sourceInfo, windowRecord, moviePrepared });
  const encodes: Array<{ range: Record<string, unknown>; tagValue: string | null; audio: boolean; forwardThenBackward: boolean }> = [];
  const encoder = {
    encode: vi.fn(encode ?? (async ({ source, range, tagValue, workspace, report, audio, forwardThenBackward }: Record<string, any>) => {
      encodes.push({ range, tagValue, audio, forwardThenBackward });
      const count = range.endFrameIndex - range.startFrameIndex + 1;
      report({ stage: 'encoding-video', encodedFrames: count, totalFrames: count });
      const mediaPath = path.join(workspace, 'media.mp4');
      await writeFile(mediaPath, `${source.sourcePath} frames ${range.startFrameIndex}-${range.endFrameIndex}`);
      return { ok: true, mediaPath, warning: undefined };
    })),
  };
  const saver = new RefinedClipSaver({
    stagedEdits,
    encoder,
    placement: placement ?? new RefinedClipPlacement({
      trashItem: async (itemPath: string) => rename(itemPath, path.join(recycleBin, path.basename(itemPath))),
    }),
    provenance,
  });
  let operations = 0;
  const save = (request: Record<string, unknown>, report: (progress: unknown) => void = () => undefined) => saver.save(event, {
    operationId: `refine_operation${++operations}`, folderPath: folder, filename: clipName, sessionId: CLIP_SESSION,
    source: { kind: 'clip' }, outcome: 'keep-both', loopify: false, ...request,
  }, report);
  const writtenRecord = () => (encodes[0].tagValue === null ? null : JSON.parse(encodes[0].tagValue));
  return { saver, save, host, encoder, encodes, writtenRecord, clipPath };
}

const windowSave = windowRequest;
const folderFiles = () => readdirSync(folder).sort();
const contentOf = (filename: string) => readFileSync(path.join(folder, filename), 'utf8');

describe('RefinedClipSaver', () => {
  describe('the record it writes', () => {
    it('writes a trim of a tagged clip as its record shifted by the trimmed frames, keeping its reference frames', async () => {
      const { save, writtenRecord } = saverFor();

      await save({ startFrame: 5, endFrame: 45 });

      expect(writtenRecord()).toEqual({
        provenanceVersion: 2,
        sourceMovie,
        sourceFrameRange: { start: 3005, end: 3045, endInclusive: true, startTimeUs: 120_000_000, endTimeUs: 122_000_000 },
        referenceFrames: endReferences,
      });
    });

    it('writes no record for a trim of an untagged clip', async () => {
      const { save, encodes } = saverFor({ sourceInfo: null });

      await save({ startFrame: 5, endFrame: 45 });

      expect(encodes[0].tagValue).toBeNull();
    });

    it('writes a window range in movie numbering with its new ends as reference frames and their movie times', async () => {
      const { save, writtenRecord } = saverFor();

      await save({ ...windowSave, startFrame: 1870, endFrame: 1940 });

      // Window frames 1870 and 1940 are movie frames 2990 and 3060, shown at 119.6 s and 122.4 s.
      expect(writtenRecord()).toEqual({
        provenanceVersion: 2,
        sourceMovie,
        sourceFrameRange: { start: 2990, end: 3060, endInclusive: true, startTimeUs: 119_600_000, endTimeUs: 122_400_000 },
        referenceFrames: [{ frameIndex: 2990, frameInfoHash: checkValue(2990) }, { frameIndex: 3060, frameInfoHash: checkValue(3060) }],
      });
    });

    it('writes a window range without movie times when the window cannot time it exactly', async () => {
      const { save, writtenRecord } = saverFor({ windowRecord: { sourceInfo: clipRecord({ start: 3000, end: 3050 }) } });

      await save({ ...windowSave, startFrame: 1870, endFrame: 1940 });

      expect(writtenRecord().sourceFrameRange).toEqual({ start: 2990, end: 3060, endInclusive: true });
    });

    it('writes a window range with movie times from the movie’s cached index when the clip stores none', async () => {
      const { save, writtenRecord } = saverFor({ windowRecord: { sourceInfo: clipRecord({ start: 3000, end: 3050 }) }, moviePrepared: true });

      await save({ ...windowSave, startFrame: 1870, endFrame: 1940 });

      expect(writtenRecord().sourceFrameRange).toEqual({ start: 2990, end: 3060, endInclusive: true, startTimeUs: 119_600_000, endTimeUs: 122_400_000 });
    });

    it('writes only the movie for Loopify of the whole clip', async () => {
      const { save, writtenRecord } = saverFor();

      await save({ startFrame: 0, endFrame: 50, loopify: true });

      expect(writtenRecord()).toEqual({ provenanceVersion: 2, sourceMovie });
    });

    it('writes only the movie for a window range that is also looped', async () => {
      const { save, writtenRecord } = saverFor();

      await save({ ...windowSave, startFrame: 1870, endFrame: 1940, loopify: true });

      expect(writtenRecord()).toEqual({ provenanceVersion: 2, sourceMovie });
    });

    it('keeps only the movie when refining a clip whose record keeps only the movie', async () => {
      const { save, writtenRecord } = saverFor({ sourceInfo: clipRecord().limitedTo('movie-only') });

      await save({ startFrame: 5, endFrame: 45 });

      expect(writtenRecord()).toEqual({ provenanceVersion: 2, sourceMovie });
    });

    it('writes no record for Loopify of an untagged clip', async () => {
      const { save, encodes } = saverFor({ sourceInfo: null });

      await save({ startFrame: 0, endFrame: 50, loopify: true });

      expect(encodes[0].tagValue).toBeNull();
    });

    it('encodes a refined clip forward only, with its sound', async () => {
      const { save, encodes } = saverFor();

      await save({ startFrame: 5, endFrame: 45 });

      expect([encodes[0].forwardThenBackward, encodes[0].audio]).toEqual([false, true]);
    });

    it('encodes a looped clip forward then backward, without sound', async () => {
      const { save, encodes } = saverFor();

      await save({ startFrame: 5, endFrame: 45, loopify: true });

      expect([encodes[0].forwardThenBackward, encodes[0].audio]).toEqual([true, false]);
    });

    it('encodes the requested frames of the clip', async () => {
      const { save, clipPath } = saverFor();

      const answer = await save({ startFrame: 5, endFrame: 45 });

      expect(contentOf(answer.result.filename)).toBe(`${clipPath} frames 5-45`);
    });

    it('encodes the requested frames of the movie window', async () => {
      const { save } = saverFor();

      const answer = await save({ ...windowSave, startFrame: 1870, endFrame: 1940 });

      expect(contentOf(answer.result.filename)).toBe(`${WINDOW_PATH} frames 1870-1940`);
    });
  });

  describe('refusals', () => {
    it.each([
      ['a folder that was not opened in this window', { folderPath: path.resolve('elsewhere') }, 'Folder access is unavailable for this folder session.'],
      ['a name that contains a folder', { filename: '..\\Feature-002.mp4' }, 'Clip filename is invalid.'],
      ['a name that is not a video', { filename: 'notes.txt' }, 'Clip filename is invalid.'],
      ['a clip that is not in the folder', { filename: 'Feature-009.mp4' }, 'Clip is not a file.'],
      ['an unknown outcome', { outcome: 'overwrite' }, 'The save request is invalid.'],
      ['an end before the start', { startFrame: 10, endFrame: 9 }, 'The edit request is invalid.'],
      ['a Loopify flag that is not true or false', { startFrame: 5, endFrame: 45, loopify: 'yes' }, 'The edit request is invalid.'],
    ])('refuses %s before reading any source', async (_case, request, message) => {
      const { save, host } = saverFor();

      const answer = await save({ startFrame: 0, endFrame: 50, ...request });

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message } });
      expect(host.registerSource).not.toHaveBeenCalled();
      expect(folderFiles()).toEqual(['Feature-002.mp4']);
    });

    it.each([
      ['a range past the clip’s last frame', { startFrame: 5, endFrame: 51 }, 'The range is outside the clip.'],
      ['a session that does not show the clip', { startFrame: 5, endFrame: 45, sessionId: WINDOW_SESSION }, 'The review session does not show this source.'],
      ['a window range starting more than a minute before the clip', { ...windowSave, startFrame: 379, endFrame: 1900 }, 'The range reaches more than a minute beyond the clip.'],
      ['a window range ending more than a minute after the clip', { ...windowSave, startFrame: 1900, endFrame: 3431 }, 'The range reaches more than a minute beyond the clip.'],
      ['a window that is not anchored', { ...windowSave, source: { kind: 'window', windowId: 'window_opaque0002' }, startFrame: 1870, endFrame: 1940 }, 'The movie window is not anchored.'],
      ['a session that does not show the window', { ...windowSave, sessionId: CLIP_SESSION, startFrame: 1870, endFrame: 1940 }, 'The review session does not show this source.'],
    ])('refuses %s without encoding', async (_case, request, message) => {
      const { save, encoder } = saverFor();

      const answer = await save(request);

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message } });
      expect(encoder.encode).not.toHaveBeenCalled();
    });

    it.each([
      ['the clip', { startFrame: 0, endFrame: 50 }],
      ['the movie window', { ...windowSave, startFrame: 1880, endFrame: 1930 }],
    ])('refuses to save the whole of %s with nothing staged', async (_case, request) => {
      const { save, encoder } = saverFor();

      const answer = await save(request);

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message: 'Nothing is staged to save.' } });
      expect(encoder.encode).not.toHaveBeenCalled();
    });

    it('refuses the window of another clip', async () => {
      const { save, encoder } = saverFor({ windowRecord: { clipPath: path.join(folder, 'Feature-003.mp4') } });

      const answer = await save({ ...windowSave, startFrame: 1870, endFrame: 1940 });

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message: 'The movie window belongs to another clip.' } });
      expect(encoder.encode).not.toHaveBeenCalled();
    });
  });

  describe('placing the saved clip', () => {
    it('keeps both clips for Keep both', async () => {
      const { save } = saverFor();

      const answer = await save({ startFrame: 5, endFrame: 45 });

      expect(answer).toMatchObject({ ok: true, result: { filename: 'Feature-002-refined.mp4', outcome: 'kept-both' } });
      expect([folderFiles(), contentOf('Feature-002.mp4')]).toEqual([['Feature-002-refined.mp4', 'Feature-002.mp4'], 'original']);
    });

    it.each([
      ['Loopify of the whole clip', { startFrame: 0, endFrame: 50, loopify: true }, 'Feature-002-looped.mp4'],
      ['Loopify of the whole clip shown in its movie window', { ...windowSave, startFrame: 1880, endFrame: 1930, loopify: true }, 'Feature-002-looped.mp4'],
      ['a trim that is also looped', { startFrame: 5, endFrame: 45, loopify: true }, 'Feature-002-refined-looped.mp4'],
      ['an extension that is also looped', { ...windowSave, startFrame: 1870, endFrame: 1940, loopify: true }, 'Feature-002-refined-looped.mp4'],
      ['a new end in the movie window that is also looped', { ...windowSave, startFrame: 1880, endFrame: 1925, loopify: true }, 'Feature-002-refined-looped.mp4'],
    ])('names the clip kept beside the original after its staged edits: %s', async (_case, request, filename) => {
      const { save } = saverFor();

      const answer = await save(request);

      expect(answer).toMatchObject({ ok: true, result: { filename, outcome: 'kept-both' } });
    });

    it('replaces the original for Replace', async () => {
      const { save, clipPath } = saverFor();

      const answer = await save({ startFrame: 5, endFrame: 45, outcome: 'replace' });

      expect(answer).toMatchObject({ ok: true, result: { filename: 'Feature-002.mp4', outcome: 'replaced' } });
      expect([folderFiles(), contentOf('Feature-002.mp4'), readdirSync(recycleBin)])
        .toEqual([['Feature-002.mp4'], `${clipPath} frames 5-45`, ['Feature-002.mp4']]);
    });

    it('answers that the refined clip was kept under a temporary name when it could not be placed', async () => {
      const { save } = saverFor({ placement: { replace: async () => { throw new RefinedClipKeptUnderTemporaryName(); } } });

      const answer = await save({ startFrame: 5, endFrame: 45, outcome: 'replace' });

      expect(answer).toEqual({ ok: false, code: 'kept-under-temporary-name',
        error: { message: 'The refined clip was kept under a temporary name in the folder.' } });
    });
  });

  describe('operations', () => {
    it('leaves no file behind when the save is cancelled while encoding', async () => {
      const partialVideoWritten = vi.fn();
      const { saver, save } = saverFor({
        encode: async ({ workspace, signal }) => {
          await writeFile(path.join(workspace, 'video.mp4'), 'partial');
          partialVideoWritten();
          await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
          return { ok: false, code: 'cancelled', error: { message: 'Encoding was cancelled.' } };
        },
      });
      const saving = save({ startFrame: 5, endFrame: 45, outcome: 'replace' });
      await vi.waitFor(() => expect(partialVideoWritten).toHaveBeenCalled());

      await expect(saver.cancel(event.sender.id, 'refine_operation1')).resolves.toEqual({ ok: true, result: null });

      await expect(saving).resolves.toEqual({ ok: false, code: 'cancelled', error: { message: 'Saving was cancelled.' } });
      expect(folderFiles()).toEqual(['Feature-002.mp4']);
      expect(contentOf('Feature-002.mp4')).toBe('original');
    });

    it('refuses to cancel the save of another app window and lets it finish', async () => {
      let finishEncoding!: () => void;
      const { saver, save } = saverFor({
        encode: async ({ workspace }) => {
          await new Promise<void>(resolve => { finishEncoding = resolve; });
          await writeFile(path.join(workspace, 'media.mp4'), 'frames 5-45');
          return { ok: true, mediaPath: path.join(workspace, 'media.mp4') };
        },
      });
      const saving = save({ startFrame: 5, endFrame: 45 });
      await vi.waitFor(() => expect(finishEncoding).toBeTypeOf('function'));

      const refusal = await saver.cancel(8, 'refine_operation1');
      finishEncoding();

      expect(refusal).toEqual({ ok: false, code: 'invalid-operation', error: { message: 'The save operation is unavailable.' } });
      await expect(saving).resolves.toMatchObject({ ok: true, result: { filename: 'Feature-002-refined.mp4' } });
    });

    it('reports checking the source, encoding and saving, in that order', async () => {
      const { save } = saverFor();
      const stages: string[] = [];

      await save({ startFrame: 5, endFrame: 45 }, progress => stages.push((progress as { stage: string }).stage));

      expect(stages).toEqual(['checking-source', 'encoding-video', 'saving-media']);
    });

    it('passes on the encoder’s warning that the record could not be written', async () => {
      const { save } = saverFor({
        encode: async ({ workspace }) => {
          await writeFile(path.join(workspace, 'media.mp4'), 'frames');
          return { ok: true, mediaPath: path.join(workspace, 'media.mp4'), warning: 'Clip saved without source metadata; the metadata writer failed.' };
        },
      });

      const answer = await save({ startFrame: 5, endFrame: 45 });

      expect(answer.result.warning).toBe('Clip saved without source metadata; the metadata writer failed.');
    });
  });
});
