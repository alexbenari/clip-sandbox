import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import { BackendError, type BackendErrorCategory } from '../model/backend-error.js';
import {
  BinaryProtocolParser,
  encodeProtocolMessage,
  type BinaryProtocolMessage,
} from './binary-frame-protocol.js';

export interface NativeProcessClientOptions {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly operationTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly onEvent?: (message: TimedProtocolMessage) => void;
}

interface PendingRequest {
  readonly started: number;
  readonly resolve: (message: TimedProtocolMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export interface TimedProtocolMessage extends BinaryProtocolMessage {
  readonly roundTripMs: number;
  readonly hostReceivedAtMs: number;
}

export class NativeProcessClient {
  readonly #options: Required<Pick<NativeProcessClientOptions, 'operationTimeoutMs' | 'shutdownTimeoutMs'>> &
    Omit<NativeProcessClientOptions, 'operationTimeoutMs' | 'shutdownTimeoutMs'>;
  readonly #parser = new BinaryProtocolParser();
  readonly #pending = new Map<string, PendingRequest>();
  #child: ChildProcessWithoutNullStreams | null = null;
  #nextRequest = 1n;
  #stderr = '';
  #terminated: BackendError | null = null;
  #eventHandler: ((message: TimedProtocolMessage) => void) | undefined;

  constructor(options: NativeProcessClientOptions) {
    if (!path.isAbsolute(options.executable)) {
      throw new Error('Native media-service executable must be an absolute path.');
    }
    this.#options = {
      ...options,
      operationTimeoutMs: options.operationTimeoutMs ?? 30_000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 2_000,
    };
    this.#eventHandler = options.onEvent;
  }

  setEventHandler(handler: ((message: TimedProtocolMessage) => void) | undefined): void {
    this.#eventHandler = handler;
  }

  diagnostics(): Readonly<{ pid: number | null; pendingRequests: number; terminated: boolean }> {
    return Object.freeze({
      pid: this.#child?.pid ?? null,
      pendingRequests: this.#pending.size,
      terminated: this.#terminated !== null,
    });
  }

  start(): void {
    if (this.#child) throw new Error('Native media service is already running.');
    if (this.#terminated) throw this.#terminated;
    const child = spawn(this.#options.executable, [...(this.#options.args ?? [])], {
      cwd: this.#options.cwd,
      env: this.#options.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child = child;
    child.stdout.on('data', (chunk: Buffer) => this.#onStdout(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString('utf8')}`.slice(-64 * 1024);
    });
    child.on('error', (error) => this.#terminate(new BackendError('process-crash', error.message, false)));
    child.on('close', (code, signal) => {
      if (!this.#terminated) {
        this.#terminate(new BackendError(
          'process-crash',
          `Native media service exited with code ${code ?? 'none'}${signal ? ` (${signal})` : ''}: ${this.#stderr.trim()}`,
          false,
        ));
      }
    });
  }

  async request(command: string, fields: Readonly<Record<string, unknown>> = {}, timeoutMs?: number): Promise<TimedProtocolMessage> {
    if (this.#terminated) throw this.#terminated;
    if (!this.#child) this.start();
    const requestId = (this.#nextRequest++).toString();
    const started = performance.now();
    return new Promise<TimedProtocolMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new BackendError('timeout', `Native command ${command} timed out.`, false);
        this.#pending.delete(requestId);
        reject(error);
        this.#terminate(error);
        this.#child?.kill();
      }, timeoutMs ?? this.#options.operationTimeoutMs);
      this.#pending.set(requestId, { started, resolve, reject, timer });
      const message = encodeProtocolMessage({ requestId, command, ...fields });
      this.#child!.stdin.write(message, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(new BackendError('process-crash', error.message, false));
      });
    });
  }

  async shutdown(): Promise<void> {
    if (!this.#child || this.#terminated) return;
    try {
      await this.request('shutdown', {}, this.#options.shutdownTimeoutMs);
    } finally {
      const child = this.#child;
      if (child && child.exitCode === null) child.kill();
      this.#child = null;
    }
  }

  #onStdout(chunk: Buffer): void {
    try {
      for (const message of this.#parser.push(chunk)) this.#deliver(message);
    } catch (error) {
      const backendError = error instanceof BackendError
        ? error
        : new BackendError('protocol-error', String(error), false);
      this.#terminate(backendError);
      this.#child?.kill();
    }
  }

  #deliver(message: BinaryProtocolMessage): void {
    const requestId = message.metadata.requestId;
    if (requestId === undefined) {
      const hostReceivedAtMs = performance.now();
      this.#eventHandler?.(Object.freeze({ ...message, hostReceivedAtMs, roundTripMs: 0 }));
      return;
    }
    if (typeof requestId !== 'string') {
      throw new BackendError('protocol-error', 'Native response has no string requestId.', false);
    }
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(requestId);
    if (message.metadata.type === 'error') {
      const wire = message.metadata.error as Record<string, unknown> | undefined;
      pending.reject(new BackendError(
        category(wire?.category),
        typeof wire?.message === 'string' ? wire.message : 'Native backend failed.',
        wire?.recoverable === true,
      ));
      return;
    }
    const hostReceivedAtMs = performance.now();
    pending.resolve(Object.freeze({
      ...message,
      hostReceivedAtMs,
      roundTripMs: hostReceivedAtMs - pending.started,
    }));
  }

  #terminate(error: BackendError): void {
    if (this.#terminated) return;
    this.#terminated = error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

function category(value: unknown): BackendErrorCategory {
  const known: BackendErrorCategory[] = [
    'invalid-request', 'invalid-state', 'frame-boundary', 'unsupported-command',
    'backend-failure', 'process-crash', 'timeout', 'protocol-error', 'stale-response',
  ];
  return typeof value === 'string' && known.includes(value as BackendErrorCategory)
    ? value as BackendErrorCategory
    : 'backend-failure';
}
