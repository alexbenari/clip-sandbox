import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { ElectronClipExtractionService } from '../../src/adapters/electron/electron-clip-extraction-service.js';

const require = createRequire(import.meta.url);

describe('ElectronClipExtractionService', () => {
  it('maps destination entries and its dedicated destination folder path into the model', async () => {
    const api = {
      openDestination: vi.fn(async () => ({ ok: true, result: {
        destinationHandle: 'destination_12345678',
        folderPath: 'D:\\pipelines\\extraction-tmp',
        entries: [{ name: 'Movie.txt', type: 'text/plain', text: 'Movie-001.mp4\n', path: 'D:\\secret' }],
      } })),
      extract: vi.fn(), saveCollection: vi.fn(), cancel: vi.fn(),
    };
    const service = new ElectronClipExtractionService({ clipSandboxDesktop: { clipExtraction: api } } as never);

    const snapshot = await service.openExtractionDestination();

    expect(snapshot).toEqual({
      destinationHandle: 'destination_12345678',
      folderPath: 'D:\\pipelines\\extraction-tmp',
      entries: [{ kind: 'collection', filename: 'Movie.txt', content: 'Movie-001.mp4\n' }],
    });
    expect(JSON.stringify(snapshot)).not.toContain('D:\\secret');
  });

  it('cancels the opaque operation currently awaiting the main process', async () => {
    let resolve!: (value: unknown) => void;
    const api = {
      openDestination: vi.fn(),
      extract: vi.fn(() => new Promise(value => { resolve = value; })),
      saveCollection: vi.fn(),
      cancel: vi.fn(async () => ({ ok: true, result: null })),
    };
    const service = new ElectronClipExtractionService({ clipSandboxDesktop: { clipExtraction: api } } as never);
    const extraction = service.extract({
      sourceHandle: 'source_12345678', destinationHandle: 'destination_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 1, endFrameIndex: 2,
    });

    await service.cancelCurrent();
    expect(api.cancel).toHaveBeenCalledWith(expect.stringMatching(/^extract_/));
    resolve({ ok: false, error: { code: 'cancelled', message: 'Cancelled.' } });
    await expect(extraction).rejects.toThrow('Cancelled.');
  });
});

describe('clip extraction IPC', () => {
  it('rejects malformed operation ids before runtime work', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const runtime = { openDestination: vi.fn() };
    const { registerClipExtractionIpc } = require('../../electron/clip-extraction-ipc.cjs');
    registerClipExtractionIpc({ ipcMain, runtime, hostForEvent: vi.fn() });

    const result = await handlers.get('clip-sandbox:clip-extraction-open-destination')?.(
      { sender: { id: 7 } }, { operationId: 'wrong' });

    expect(result).toMatchObject({ ok: false, operationId: 'invalid-operation', error: { code: 'invalid-operation' } });
    expect(runtime.openDestination).not.toHaveBeenCalled();
  });
});
