// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { ZoomVideoEditWorkflow } from '../../src/app/zoom-video-edit-workflow.js';
import { Clip } from '../../src/domain/clip.js';

function sourceClip() {
  return new Clip({
    id: 'clip_1',
    file: new File(['source'], 'alpha.mp4', { type: 'video/mp4' }),
  });
}

describe('zoom video edit workflow', () => {
  test('emits started, created, and finished around a successful edit', async () => {
    const clipEditor = {
      createVideoEdit: vi.fn(async () => ({
        ok: true,
        createdFile: { name: 'alpha-looped.mp4' },
      })),
    };
    const events = [];
    const workflow = new ZoomVideoEditWorkflow({
      clipEditor,
      onStarted: ({ edit, sourceClip }) => events.push(['started', edit.id, sourceClip.id]),
      onCreated: ({ createdFile }) => events.push(['created', createdFile.name]),
      onFailed: () => events.push(['failed']),
      onFinished: () => events.push(['finished']),
    });
    const edit = { id: 'loopify', label: 'Loopify' };
    const clip = sourceClip();
    const folderSession = { folderPath: 'C:/clips' };

    const result = await workflow.run({ edit, sourceClip: clip, folderSession });

    expect(result.ok).toBe(true);
    expect(clipEditor.createVideoEdit).toHaveBeenCalledWith({
      clip,
      editId: 'loopify',
      folderSession,
    });
    expect(events).toEqual([
      ['started', 'loopify', 'clip_1'],
      ['created', 'alpha-looped.mp4'],
      ['finished'],
    ]);
    expect(workflow.isRunning()).toBe(false);
  });

  test('emits failed and finished when the editor reports failure', async () => {
    const onFailed = vi.fn();
    const onFinished = vi.fn();
    const workflow = new ZoomVideoEditWorkflow({
      clipEditor: {
        createVideoEdit: vi.fn(async () => ({ ok: false, code: 'missing-source-path' })),
      },
      onFailed,
      onFinished,
    });

    const result = await workflow.run({
      edit: { id: 'loopify', label: 'Loopify' },
      sourceClip: sourceClip(),
      folderSession: { folderPath: 'C:/clips' },
    });

    expect(result).toEqual({ ok: false, code: 'missing-source-path' });
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({
      result: { ok: false, code: 'missing-source-path' },
    }));
    expect(onFinished).toHaveBeenCalledOnce();
  });

  test('rejects concurrent runs without calling the editor twice', async () => {
    let resolveEdit;
    const clipEditor = {
      createVideoEdit: vi.fn(() => new Promise((resolve) => {
        resolveEdit = resolve;
      })),
    };
    const workflow = new ZoomVideoEditWorkflow({ clipEditor });
    const request = {
      edit: { id: 'loopify', label: 'Loopify' },
      sourceClip: sourceClip(),
      folderSession: { folderPath: 'C:/clips' },
    };

    const first = workflow.run(request);
    const second = await workflow.run(request);
    resolveEdit({ ok: true, createdFile: { name: 'alpha-looped.mp4' } });
    await first;

    expect(second).toEqual({ ok: false, code: 'not-runnable' });
    expect(clipEditor.createVideoEdit).toHaveBeenCalledTimes(1);
  });
});

test.each(['onStarted', 'onCreated', 'onFailed', 'onFinished'])('cleans up and permits another run after %s throws', async (callback) => {
  const fault = new Error(`${callback} failed`);
  const callbackFn = vi.fn().mockImplementationOnce(() => { throw fault; });
  const result = callback === 'onFailed' ? { ok: false, code: 'edit-failed' }
    : { ok: true, createdFile: new File(['output'], 'alpha-looped.mp4') };
  const finished = callback === 'onFinished' ? callbackFn : vi.fn();
  const editor = { createVideoEdit: vi.fn(async () => result) };
  const workflow = new ZoomVideoEditWorkflow({ clipEditor: editor, [callback]: callbackFn, onFinished: finished });
  const request = { edit: { id: 'loopify', label: 'Loopify' }, sourceClip: sourceClip(), folderSession: { folderPath: 'C:/clips' } };
  await expect(workflow.run(request)).rejects.toThrow();
  expect(workflow.isRunning()).toBe(false);
  expect(finished).toHaveBeenCalledOnce();
  await expect(workflow.run(request)).resolves.toEqual(result);
});

test('preserves successful output and both callback failures when finishing also throws', async () => {
  const output = { ok: true, createdFile: new File(['output'], 'alpha-looped.mp4') };
  const createdFailure = new Error('Refresh failed');
  const finishFailure = new Error('Toolbar failed');
  const workflow = new ZoomVideoEditWorkflow({
    clipEditor: { createVideoEdit: vi.fn(async () => output) },
    onCreated: () => { throw createdFailure; },
    onFinished: () => { throw finishFailure; },
  });
  const request = { edit: { id: 'loopify', label: 'Loopify' }, sourceClip: sourceClip(), folderSession: { folderPath: 'C:/clips' } };
  await expect(workflow.run(request)).rejects.toMatchObject({ result: output, errors: [createdFailure, finishFailure] });
  expect(workflow.isRunning()).toBe(false);
});
