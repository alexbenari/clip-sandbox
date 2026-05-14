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
    const workflow = new ZoomVideoEditWorkflow({
      clipEditor: {
        createVideoEdit: vi.fn(async () => ({ ok: false, code: 'missing-source-path' })),
      },
      onFailed: vi.fn(),
      onFinished: vi.fn(),
    });

    const result = await workflow.run({
      edit: { id: 'loopify', label: 'Loopify' },
      sourceClip: sourceClip(),
      folderSession: { folderPath: 'C:/clips' },
    });

    expect(result).toEqual({ ok: false, code: 'missing-source-path' });
    expect(workflow.onFailed).toHaveBeenCalledWith(expect.objectContaining({
      result: { ok: false, code: 'missing-source-path' },
    }));
    expect(workflow.onFinished).toHaveBeenCalledOnce();
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
