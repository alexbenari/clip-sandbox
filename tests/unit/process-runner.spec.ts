// @vitest-environment node
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ProcessRunner } = require('../../electron/process-runner.cjs');

function fakeChild(options = {}) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  const spawnProcess = vi.fn((..._spawnArguments: unknown[]) => child);
  return { child, spawnProcess, runner: new ProcessRunner({ spawnProcess, ...options }) };
}

describe('ProcessRunner', () => {
  it('reports a process that exits with code 0 as completed', async () => {
    const { child, runner } = fakeChild();

    const result = runner.run('ffmpeg', ['-version']);
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({ ok: true, code: 'completed', exitCode: 0 });
  });

  it('returns the text the process wrote to stdout and stderr', async () => {
    const { child, runner } = fakeChild();

    const result = runner.run('ffmpeg', ['-version']);
    child.stdout.emit('data', Buffer.from('out one, '));
    child.stdout.emit('data', Buffer.from('out two'));
    child.stderr.emit('data', Buffer.from('warning one, '));
    child.stderr.emit('data', Buffer.from('warning two'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({ stdout: 'out one, out two', stderr: 'warning one, warning two' });
  });

  it('reports a process that exits with a non-zero code as failed', async () => {
    const { child, runner } = fakeChild();

    const result = runner.run('ffmpeg', ['-i', 'missing.mkv']);
    child.emit('close', 1);

    await expect(result).resolves.toMatchObject({ ok: false, code: 'process-failed', exitCode: 1 });
  });

  it('reports a process that could not start as failed with the spawn error', async () => {
    const { child, runner } = fakeChild();
    const spawnError = new Error('spawn ffmpeg ENOENT');

    const result = runner.run('ffmpeg', ['-version']);
    child.emit('error', spawnError);
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({ ok: false, code: 'process-failed', error: spawnError });
  });

  it('reports a process stopped through an aborted signal as cancelled', async () => {
    const { child, runner } = fakeChild();
    const controller = new AbortController();

    const result = runner.run('ffmpeg', ['-i', 'movie.mkv'], { signal: controller.signal });
    controller.abort();
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({ ok: false, code: 'cancelled' });
  });

  it('reports the frame numbers the process prints while it works', async () => {
    const { child, runner } = fakeChild();
    const onProgress = vi.fn();

    const result = runner.run('ffmpeg', ['-progress', 'pipe:1'], { onProgress });
    child.stdout.emit('data', Buffer.from('frame=10\nfps=25\nframe=20\n'));
    child.emit('close', 0);
    await result;

    expect(onProgress.mock.calls).toEqual([[10], [20]]);
  });

  it('reports a frame number that arrives split across two chunks', async () => {
    const { child, runner } = fakeChild();
    const onProgress = vi.fn();

    const result = runner.run('ffmpeg', ['-progress', 'pipe:1'], { onProgress });
    child.stdout.emit('data', Buffer.from('frame=1'));
    child.stdout.emit('data', Buffer.from('23\n'));
    child.emit('close', 0);
    await result;

    expect(onProgress.mock.calls).toEqual([[123]]);
  });

  it('does not collect stdout when progress is being reported', async () => {
    const { child, runner } = fakeChild();

    const result = runner.run('ffmpeg', ['-progress', 'pipe:1'], { onProgress: vi.fn() });
    child.stdout.emit('data', Buffer.from('frame=10\n'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({ stdout: '' });
  });

  it('stops a process whose stdout exceeds the size limit and reports the output as too large', async () => {
    const { child, runner } = fakeChild({ maxStdoutBytes: 16 });

    const result = runner.run('ffmpeg', ['-i', 'movie.mkv']);
    child.stdout.emit('data', Buffer.alloc(10));
    child.stdout.emit('data', Buffer.alloc(10));
    child.emit('close', null);

    const { ok, code } = await result;
    expect({ ok, code }).toEqual({ ok: false, code: 'process-output-too-large' });
    expect(child.kill).toHaveBeenCalled();
  });

  it('starts the command hidden with stdin closed, passing its arguments, working folder, environment and signal', () => {
    const { spawnProcess, runner } = fakeChild();
    const controller = new AbortController();
    const env = { PATH: 'D:\\tools' };

    void runner.run('ffmpeg', ['-i', 'movie.mkv'], { cwd: 'D:\\work', env, signal: controller.signal });

    expect(spawnProcess).toHaveBeenCalledWith('ffmpeg', ['-i', 'movie.mkv'], {
      cwd: 'D:\\work',
      env,
      signal: controller.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  });
});
