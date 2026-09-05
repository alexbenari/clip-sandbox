import { describe, expect, it } from 'vitest';

import { executeStreaming } from '../../src/tooling/process.mjs';

describe('streaming process execution', () => {
  it('delivers complete lines before process completion', async () => {
    const lines: string[] = [];
    await executeStreaming(process.execPath, ['-e',
      "console.log('one'); setTimeout(() => console.log('two'), 10);"], {
      onStdoutLine: (line: string) => lines.push(line),
    });

    expect(lines).toEqual(['one', 'two']);
  });

  it('terminates an operation when its signal is aborted', async () => {
    const controller = new AbortController();
    const running = executeStreaming(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
      signal: controller.signal,
      timeoutMs: 15_000,
    });
    controller.abort();

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  });
});
