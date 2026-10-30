// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIP_SESSION, WINDOW_ID, clipRecord, event, stagedEditsIn, windowRequest } from '../support/staged-edit-fixtures.js';

const require = createRequire(import.meta.url);
const { ZoomEditPreviews } = require('../../electron/zoom-edit-previews.cjs');

let root: string;
let folder: string;
let previewFolder: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'zoom-edit-previews-'));
  folder = path.join(root, 'picks');
  previewFolder = path.join(root, 'profile', 'zoom-edit-previews');
  mkdirSync(folder);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

type FfmpegRun = (args: string[], options: { signal: AbortSignal; onProgress: (frame: number) => void }) => Promise<unknown>;

const writesOutput: FfmpegRun = async args => {
  await writeFile(args[args.length - 1], 'preview');
  return { ok: true, code: 'completed' };
};

// Stays open until the run is aborted, like an FFmpeg run stopped by its signal.
const runsUntilAborted: FfmpegRun = async (args, { signal }) => {
  await writeFile(args[args.length - 1], 'partial');
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  return { ok: false, code: 'cancelled' };
};

async function previewsWith({ run = writesOutput, sourceInfo = clipRecord() as unknown, windowRecord = {} as object } = {}) {
  const { stagedEdits, clipPath } = stagedEditsIn(folder, { sourceInfo, windowRecord });
  let ids = 0;
  const runCommand = vi.fn((_ffmpeg: string, args: string[], options: Parameters<FfmpegRun>[1]) => run(args, options));
  const previews = new ZoomEditPreviews({
    folder: previewFolder, stagedEdits, resolveFfmpeg: () => 'ffmpeg', runCommand, randomId: () => `id${++ids}`,
  });
  await previews.initialize();
  let operations = 0;
  const render = (request: Record<string, unknown> = {}, requestEvent = event, report: (progress: unknown) => void = () => undefined) =>
    previews.render(requestEvent, {
      operationId: `preview_operation${++operations}`, folderPath: folder, filename: 'Feature-002.mp4', sessionId: CLIP_SESSION,
      source: { kind: 'clip' }, startFrame: 5, endFrame: 45, ...request,
    }, report);
  return { previews, render, runCommand, clipPath };
}

const previewFiles = () => readdirSync(previewFolder).sort();
const argumentAfter = (args: string[], name: string) => args[args.indexOf(name) + 1];

// The frames whose times in seconds fall between the select filter's bounds.
function selectedSeconds(args: string[]): [number, number] {
  const [, start, end] = /between\(t,([\d.]+),([\d.]+)\)/.exec(argumentAfter(args, '-filter_complex'))!;
  return [Number(start), Number(end)];
}

describe('ZoomEditPreviews', () => {
  it('renders the staged frames of the shown clip and answers the address of a file in the preview folder', async () => {
    const { render } = await previewsWith();

    const answer = await render();

    expect(answer).toEqual({ ok: true, result: { mediaSource: expect.stringMatching(/\?modified=\d+$/) } });
    expect(answer.result.mediaSource.startsWith(pathToFileURL(path.join(previewFolder, 'preview-id1.mp4')).href)).toBe(true);
    expect(previewFiles()).toEqual(['preview-id1.mp4']);
  });

  it('selects exactly the staged frames by their times in the source the review indexed', async () => {
    const { render, runCommand, clipPath } = await previewsWith();

    await render({ startFrame: 5, endFrame: 45 });

    // Frames are 40 ms apart: frame 5 at 0.2 s, frame 45 at 1.8 s.
    const args = runCommand.mock.calls[0][1];
    const [from, to] = selectedSeconds(args);
    expect(argumentAfter(args, '-i')).toBe(clipPath);
    expect([from > 0.16 && from <= 0.2, to >= 1.8 && to < 1.84]).toEqual([true, true]);
  });

  it('plays the staged frames forward then backward, without sound', async () => {
    const { render, runCommand } = await previewsWith();

    await render();

    const args = runCommand.mock.calls[0][1];
    expect(argumentAfter(args, '-filter_complex')).toMatch(/split=2\[forward\]\[reverse\];\[reverse\]reverse\[backward\];\[forward\]\[backward\]concat/);
    expect(args).toContain('-an');
  });

  it('reports the frames rendered out of twice the staged frames', async () => {
    const { render } = await previewsWith({ run: async (args, { onProgress }) => {
      onProgress(30);
      return writesOutput(args, { onProgress } as never);
    } });
    const reports: unknown[] = [];

    await render({ startFrame: 5, endFrame: 45 }, event, progress => reports.push(progress));

    expect(reports).toEqual([{ renderedFrames: 30, totalFrames: 82 }]);
  });

  describe('refusals', () => {
    it.each([
      ['a folder that was not opened in this window', { folderPath: path.resolve('elsewhere') }, 'Folder access is unavailable for this folder session.'],
      ['a name that contains a folder', { filename: '..\\Feature-002.mp4' }, 'Clip filename is invalid.'],
      ['a range past the clip’s last frame', { endFrame: 51 }, 'The range is outside the clip.'],
      ['a session that does not show the clip', { sessionId: 'session_window01' }, 'The review session does not show this source.'],
      ['a window range more than a minute beyond the clip', { ...windowRequest, startFrame: 379, endFrame: 1900 }, 'The range reaches more than a minute beyond the clip.'],
      ['a window that is not anchored', { ...windowRequest, source: { kind: 'window', windowId: 'window_opaque0002' } }, 'The movie window is not anchored.'],
    ])('refuses %s without rendering', async (_case, request, message) => {
      const { render, runCommand } = await previewsWith();

      const answer = await render(request);

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message } });
      expect([runCommand.mock.calls.length, previewFiles()]).toEqual([0, []]);
    });

    it('refuses the window of another clip', async () => {
      const { render, runCommand } = await previewsWith({ windowRecord: { clipPath: path.join(folder, 'Feature-003.mp4') } });

      const answer = await render({ ...windowRequest, startFrame: 1870, endFrame: 1940 });

      expect(answer).toEqual({ ok: false, code: 'invalid-request', error: { message: 'The movie window belongs to another clip.' } });
      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  it('renders a range of the anchored movie window', async () => {
    const { render, runCommand } = await previewsWith();

    const answer = await render({ source: { kind: 'window', windowId: WINDOW_ID }, sessionId: 'session_window01', startFrame: 1870, endFrame: 1940 });

    expect(answer.ok).toBe(true);
    expect(argumentAfter(runCommand.mock.calls[0][1], '-i')).toBe('D:\\app\\movie-window-cache\\key\\window.mkv');
  });

  describe('files', () => {
    it('removes the previous preview of the app window when it renders a new one', async () => {
      const { render } = await previewsWith();
      await render({ startFrame: 5 });

      await render({ startFrame: 6 });

      expect(previewFiles()).toEqual(['preview-id2.mp4']);
    });

    it('keeps the preview of another app window', async () => {
      const { render } = await previewsWith();
      await render({}, { sender: { id: 8 } });

      await render();

      expect(previewFiles()).toEqual(['preview-id1.mp4', 'preview-id2.mp4']);
    });

    it('removes the app window’s preview when it is released', async () => {
      const { previews, render } = await previewsWith();
      await render({}, { sender: { id: 8 } });
      await render();

      await previews.release(event.sender.id);

      expect(previewFiles()).toEqual(['preview-id1.mp4']);
    });

    it('stops a preview being rendered when it is released, answering that it was replaced and leaving no file', async () => {
      const { previews, render, runCommand } = await previewsWith({ run: runsUntilAborted });
      const rendering = render();
      await vi.waitFor(() => expect(runCommand).toHaveBeenCalled());

      await previews.release(event.sender.id);

      await expect(rendering).resolves.toEqual({ ok: false, code: 'cancelled', error: { message: 'The preview was replaced.' } });
      expect(previewFiles()).toEqual([]);
    });

    it('stops the preview being rendered when a new one is asked for, keeping only the new one', async () => {
      let first = true;
      const { render, runCommand } = await previewsWith({ run: (args, options) => {
        const run = first ? runsUntilAborted : writesOutput;
        first = false;
        return run(args, options);
      } });
      const replaced = render({ startFrame: 5 });
      await vi.waitFor(() => expect(runCommand).toHaveBeenCalled());

      const answer = await render({ startFrame: 6 });

      await expect(replaced).resolves.toMatchObject({ ok: false, code: 'cancelled' });
      expect([answer.ok, previewFiles()]).toEqual([true, ['preview-id2.mp4']]);
    });

    it('answers that the preview could not be made, leaving no file, when rendering fails', async () => {
      const { render } = await previewsWith({ run: async args => {
        await writeFile(args[args.length - 1], 'partial');
        return { ok: false, code: 'process-failed' };
      } });

      const answer = await render();

      expect(answer).toEqual({ ok: false, code: 'preview-failed', error: { message: 'The preview could not be made.' } });
      expect(previewFiles()).toEqual([]);
    });

    it('removes previews left by an earlier app session when it starts', async () => {
      mkdirSync(previewFolder, { recursive: true });
      writeFileSync(path.join(previewFolder, 'preview-earlier.mp4'), 'earlier');

      await previewsWith();

      expect(previewFiles()).toEqual([]);
    });

    it('removes the preview folder when it is disposed', async () => {
      const { previews, render } = await previewsWith();
      await render();

      await previews.dispose();

      expect(existsSync(previewFolder)).toBe(false);
    });
  });
});
