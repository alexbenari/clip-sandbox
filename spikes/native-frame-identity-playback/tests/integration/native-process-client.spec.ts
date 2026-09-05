import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NativeProcessClient } from '../../src/adapter/native-process-client.js';

const fixtureRoot = path.resolve(import.meta.dirname, '..', 'fixtures');

describe('native process supervision', () => {
  it('surfaces a helper crash with its diagnostic stderr', async () => {
    const client = new NativeProcessClient({
      executable: process.execPath,
      args: [path.join(fixtureRoot, 'native-process-exit.cjs')],
      operationTimeoutMs: 2_000,
    });

    await expect(client.request('status')).rejects.toMatchObject({
      category: 'process-crash',
      message: expect.stringContaining('intentional native-process test exit'),
    });
  });

  it('terminates an unresponsive helper after the operation timeout', async () => {
    const client = new NativeProcessClient({
      executable: process.execPath,
      args: [path.join(fixtureRoot, 'native-process-hang.cjs')],
      operationTimeoutMs: 100,
    });

    expect(client.diagnostics()).toEqual({ pid: null, pendingRequests: 0, terminated: false });
    const request = client.request('status');
    expect(client.diagnostics()).toMatchObject({ pendingRequests: 1, terminated: false });
    expect(client.diagnostics().pid).toBeGreaterThan(0);
    await expect(request).rejects.toMatchObject({
      category: 'timeout',
      message: expect.stringContaining('status'),
    });
    expect(client.diagnostics()).toMatchObject({ pendingRequests: 0, terminated: true });
  });
});
