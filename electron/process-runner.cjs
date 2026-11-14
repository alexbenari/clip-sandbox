const { spawn } = require('node:child_process');

class ProcessRunner {
  #spawnProcess;
  #maxStdoutBytes;

  constructor({ spawnProcess = spawn, maxStdoutBytes = 128 * 1024 * 1024 } = {}) {
    this.#spawnProcess = spawnProcess;
    this.#maxStdoutBytes = maxStdoutBytes;
  }

  run(command, args, { cwd = process.cwd(), signal, env = process.env, onProgress } = {}) {
    return new Promise((resolve) => {
      const child = this.#spawnProcess(command, args, {
        cwd,
        env,
        signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let progressBuffer = '';
      let processError = null;
      let outputTooLarge = false;
      child.stdout?.on('data', chunk => {
        if (!onProgress) {
          if (stdout.length + chunk.length > this.#maxStdoutBytes) {
            if (!outputTooLarge) child.kill();
            outputTooLarge = true;
            return;
          }
          stdout += chunk.toString();
          return;
        }
        progressBuffer += chunk.toString();
        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop().slice(-1024);
        for (const line of lines) {
          const match = /^frame=(\d+)$/.exec(line.trim());
          if (match) onProgress(Number(match[1]));
        }
      });
      child.stderr?.on('data', chunk => { stderr = `${stderr}${chunk.toString()}`.slice(-8 * 1024 * 1024); });
      child.once('error', error => { processError = error; });
      child.once('close', exitCode => resolve({
        ok: exitCode === 0 && !processError && !signal?.aborted && !outputTooLarge,
        code: outputTooLarge ? 'process-output-too-large' : signal?.aborted ? 'cancelled'
          : exitCode === 0 && !processError ? 'completed' : 'process-failed',
        exitCode,
        error: processError,
        stdout,
        stderr,
      }));
    });
  }
}

module.exports = { ProcessRunner };
