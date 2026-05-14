// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { ClipEditor } from '../../src/business-logic/clip-editor.js';
import { Clip } from '../../src/domain/clip.js';

describe('clip editor', () => {
  test('builds the Loopify request with the preferred output filename', async () => {
    const runtimeEditingService = {
      createVideoEdit: vi.fn(async () => ({
        ok: true,
        createdFile: { name: 'alpha-looped.mp4' },
      })),
    };
    const editor = new ClipEditor({ runtimeEditingService });
    const file = new File(['x'], 'alpha.mov', { type: 'video/quicktime' });
    Object.defineProperty(file, 'path', {
      configurable: true,
      value: 'C:/clips/alpha.mov',
    });
    const clip = new Clip({
      id: 'clip_1',
      file,
    });

    const result = await editor.createVideoEdit({
      clip,
      editId: 'loopify',
      folderSession: { folderPath: 'C:/clips' },
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'created',
      request: {
        editId: 'loopify',
        preferredOutputFilename: 'alpha-looped.mp4',
        outputFolderPath: 'C:/clips',
        sourcePath: 'C:/clips/alpha.mov',
      },
    });
    expect(runtimeEditingService.createVideoEdit).toHaveBeenCalledWith(result.request);
  });

  test('returns explicit validation failures before reaching the runtime service', async () => {
    const runtimeEditingService = { createVideoEdit: vi.fn() };
    const editor = new ClipEditor({ runtimeEditingService });

    await expect(editor.createVideoEdit({
      clip: null,
      editId: 'loopify',
      folderSession: { folderPath: 'C:/clips' },
    })).resolves.toMatchObject({ ok: false, code: 'missing-source-path' });

    await expect(editor.createVideoEdit({
      clip: new Clip({
        id: 'clip_1',
        file: new File(['x'], 'alpha.mov', { type: 'video/quicktime' }),
      }),
      editId: 'missing',
      folderSession: { folderPath: 'C:/clips' },
    })).resolves.toMatchObject({ ok: false, code: 'unsupported-edit' });

    expect(runtimeEditingService.createVideoEdit).not.toHaveBeenCalled();
  });
});
