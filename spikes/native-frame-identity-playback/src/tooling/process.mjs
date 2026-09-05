import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';

export function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: options.timeoutMs ?? 30_000,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      encoding: options.encoding ?? 'utf8',
      cwd: options.cwd,
      env: options.env,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        error.message = `${file} ${args.join(' ')} failed: ${String(stderr || error.message).trim()}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function executeStreaming(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      shell: false,
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let abortRequested = false;
    const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
    const stdoutLines = createLineCollector(options.onStdoutLine);
    const stderrLines = createLineCollector(options.onStderrLine);

    const timeout = options.timeoutMs === undefined ? null : setTimeout(() => {
      child.kill();
    }, options.timeoutMs);

    const onAbort = () => {
      abortRequested = true;
      child.kill();
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(result);
    };

    const append = (kind, chunk) => {
      const value = chunk.toString(options.encoding ?? 'utf8');
      if (kind === 'stdout') {
        stdout += value;
        stdoutLines.push(value);
      } else {
        stderr += value;
        stderrLines.push(value);
      }
      if (stdout.length + stderr.length > maxBuffer) {
        child.kill();
      }
    };

    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => {
      stdoutLines.flush();
      stderrLines.flush();
      if (abortRequested) {
        const error = new Error(`${file} was cancelled.`);
        error.name = 'AbortError';
        finish(error);
        return;
      }
      if (stdout.length + stderr.length > maxBuffer) {
        finish(new Error(`${file} exceeded the ${maxBuffer}-byte output limit.`));
        return;
      }
      if (code !== 0) {
        const error = new Error(`${file} ${args.join(' ')} failed with code ${code ?? 'none'}: ${String(stderr).trim()}`);
        error.code = code;
        error.signal = signal;
        error.stdout = stdout;
        error.stderr = stderr;
        finish(error);
        return;
      }
      finish(null, { stdout, stderr, code });
    });
  });
}

function createLineCollector(emit) {
  let pending = '';
  return {
    push(value) {
      pending += value;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) emit?.(line);
    },
    flush() {
      if (pending) emit?.(pending);
      pending = '';
    },
  };
}

export async function mapWithConcurrency(values, concurrency, operation) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}
