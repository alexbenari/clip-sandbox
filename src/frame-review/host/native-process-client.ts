import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import { BinaryFrameProtocol, BinaryFrameProtocolParser, type IBinaryProtocolMessage } from '../binary-frame-protocol.js';
import { BackendError, type BackendErrorCategory } from '../model/backend-error.js';
import { FrameReviewWireValue } from '../model/source-frame-identity.js';

export interface INativeProcessClientOptions {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly operationTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly onEvent?: (message: ITimedProtocolMessage) => void;
}

interface IPendingRequest {
  readonly started: number;
  readonly resolve: (message: ITimedProtocolMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export interface ITimedProtocolMessage extends IBinaryProtocolMessage {
  readonly roundTripMs: number;
  readonly hostReceivedAtMs: number;
}

export class NativeProcessClient {
  private readonly options: Required<Pick<INativeProcessClientOptions, 'operationTimeoutMs' | 'shutdownTimeoutMs'>>
    & Omit<INativeProcessClientOptions, 'operationTimeoutMs' | 'shutdownTimeoutMs'>;
  private readonly parser = new BinaryFrameProtocolParser();
  private readonly pending = new Map<string, IPendingRequest>();
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextRequest = 1n;
  private stderr = '';
  private terminated: BackendError | null = null;
  private eventHandler: ((message: ITimedProtocolMessage) => void) | undefined;

  constructor(options: INativeProcessClientOptions) {
    if (!path.isAbsolute(options.executable)) throw new Error('Native executable must be an absolute path.');
    this.options = {
      ...options,
      operationTimeoutMs: options.operationTimeoutMs ?? 30_000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 2_000,
    };
    this.eventHandler = options.onEvent;
  }

  setEventHandler(handler: ((message: ITimedProtocolMessage) => void) | undefined): void {
    this.eventHandler = handler;
  }

  diagnostics(): Readonly<{ pid: number | null; pendingRequests: number; terminated: boolean }> {
    return Object.freeze({ pid: this.child?.pid ?? null, pendingRequests: this.pending.size, terminated: !!this.terminated });
  }

  start(): void {
    if (this.child) throw new Error('Native media service is already running.');
    if (this.terminated) throw this.terminated;
    const child = spawn(this.options.executable, [...(this.options.args ?? [])], {
      cwd: this.options.cwd,
      env: this.options.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
    child.stderr.on('data', (chunk: Buffer) => { this.stderr = `${this.stderr}${chunk.toString('utf8')}`.slice(-64 * 1024); });
    child.on('error', (error) => this.terminate(new BackendError('process-crash', error.message, false)));
    child.on('close', (code, signal) => {
      if (!this.terminated) {
        try {
          this.parser.finish();
        } catch (error) {
          this.terminate(error instanceof BackendError
            ? error : new BackendError('protocol-error', String(error), false));
          return;
        }
        this.terminate(new BackendError('process-crash',
          `Native media service exited with code ${code ?? 'none'}${signal ? ` (${signal})` : ''}: ${this.stderr.trim()}`,
          false));
      }
    });
  }

  async request(
    command: string,
    fields: Readonly<Record<string, unknown>> = {},
    timeoutMs?: number,
  ): Promise<ITimedProtocolMessage> {
    if (this.terminated) throw this.terminated;
    if (!this.child) this.start();
    const requestId = (this.nextRequest++).toString();
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new BackendError('timeout', `Native command ${command} timed out.`, false);
        this.pending.delete(requestId);
        reject(error);
        this.terminate(error);
        this.child?.kill();
      }, timeoutMs ?? this.options.operationTimeoutMs);
      this.pending.set(requestId, { started, resolve, reject, timer });
      this.child!.stdin.write(BinaryFrameProtocol.encode({ requestId, command, ...fields }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new BackendError('process-crash', error.message, false));
      });
    });
  }

  async shutdown(): Promise<void> {
    if (!this.child || this.terminated) return;
    try {
      await this.request('shutdown', {}, this.options.shutdownTimeoutMs);
    } finally {
      const child = this.child;
      if (child && child.exitCode === null) child.kill();
      this.child = null;
    }
  }

  private onStdout(chunk: Buffer): void {
    try {
      for (const message of this.parser.push(chunk)) this.deliver(message);
    } catch (error) {
      const backendError = error instanceof BackendError
        ? error : new BackendError('protocol-error', String(error), false);
      this.terminate(backendError);
      this.child?.kill();
    }
  }

  private deliver(message: IBinaryProtocolMessage): void {
    const requestId = message.metadata.requestId;
    if (requestId === undefined) {
      const hostReceivedAtMs = performance.now();
      this.eventHandler?.(Object.freeze({ ...message, hostReceivedAtMs, roundTripMs: 0 }));
      return;
    }
    if (typeof requestId !== 'string') throw new BackendError('protocol-error', 'Native response has no string requestId.', false);
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (message.metadata.type === 'error') {
      const wire = FrameReviewWireValue.record(message.metadata.error, 'native error');
      pending.reject(new BackendError(
        this.category(wire?.category),
        typeof wire?.message === 'string' ? wire.message : 'Native backend failed.',
        wire?.recoverable === true,
      ));
      return;
    }
    const hostReceivedAtMs = performance.now();
    pending.resolve(Object.freeze({ ...message, hostReceivedAtMs, roundTripMs: hostReceivedAtMs - pending.started }));
  }

  private terminate(error: BackendError): void {
    if (this.terminated) return;
    this.terminated = error;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }

  private category(value: unknown): BackendErrorCategory {
    const known: BackendErrorCategory[] = [
      'invalid-request', 'invalid-state', 'frame-boundary', 'unsupported-command', 'backend-failure',
      'cache-unavailable', 'process-crash', 'timeout', 'protocol-error', 'stale-response',
    ];
    return typeof value === 'string' && known.includes(value as BackendErrorCategory)
      ? value as BackendErrorCategory : 'backend-failure';
  }
}

export interface INativeCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export class NativeCommandProcess {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  run(executable: string, args: readonly string[], options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly onStdoutLine?: (line: string) => void;
  } = {}): Promise<INativeCommandResult> {
    if (!path.isAbsolute(executable)) return Promise.reject(new Error('Command executable must be an absolute path.'));
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], {
        env: this.environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(Object.freeze({ stdout, stderr }));
      };
      const abort = () => {
        child.kill();
        finish(new DOMException('Native command was cancelled.', 'AbortError'));
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new BackendError('timeout', `Native command timed out: ${path.basename(executable)}`, false));
      }, options.timeoutMs ?? 30 * 60_000);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return;
        const text = chunk.toString('utf8');
        stdout += text;
        if (stdout.length > 64 * 1024 * 1024) {
          child.kill();
          finish(new BackendError('protocol-error', 'Native command output exceeded 64 MiB.', false));
          return;
        }
        lineBuffer += text;
        try {
          for (;;) {
            const newline = lineBuffer.indexOf('\n');
            if (newline < 0) break;
            const line = lineBuffer.slice(0, newline).trim();
            lineBuffer = lineBuffer.slice(newline + 1);
            if (line) options.onStdoutLine?.(line);
          }
        } catch (error) {
          child.kill();
          finish(new BackendError('protocol-error', `Native command output is invalid: ${String(error)}`, false));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-64 * 1024); });
      child.on('error', (error) => finish(new BackendError('process-crash', error.message, false)));
      child.on('close', (code) => {
        if (settled) return;
        try {
          const finalLine = lineBuffer.trim();
          if (finalLine) options.onStdoutLine?.(finalLine);
        } catch (error) {
          finish(new BackendError('protocol-error', `Native command output is invalid: ${String(error)}`, false));
          return;
        }
        if (code === 0) finish();
        else finish(new BackendError('backend-failure',
          `${path.basename(executable)} exited with code ${code ?? 'none'}: ${stderr.trim() || stdout.trim()}`, false));
      });
    });
  }
}
