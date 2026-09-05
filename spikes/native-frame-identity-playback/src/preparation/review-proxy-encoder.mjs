import { rm } from 'node:fs/promises';

import { executeStreaming } from '../tooling/process.mjs';

export const SOFTWARE_FFMPEG_BACKEND_ID = 'ffmpeg-cli-software-v1';

export function assertReviewProxyEncoder(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Review proxy encoding backend is required.');
  }
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.id)) {
    throw new Error('Review proxy encoding backend has an invalid identifier.');
  }
  if (typeof value.encode !== 'function') {
    throw new Error('Review proxy encoding backend must implement encode().');
  }
  return value;
}

export class FfmpegCliReviewProxyEncoder {
  constructor(configuration) {
    if (!configuration || typeof configuration !== 'object') {
      throw new Error('FFmpeg CLI encoding configuration is required.');
    }
    if (typeof configuration.executable !== 'string' || !configuration.executable) {
      throw new Error('FFmpeg CLI encoding executable is required.');
    }
    if (typeof configuration.buildArguments !== 'function') {
      throw new Error('FFmpeg CLI encoding argument builder is required.');
    }
    this.id = configuration.id ?? SOFTWARE_FFMPEG_BACKEND_ID;
    assertReviewProxyEncoder(this);
    this.executable = configuration.executable;
    this.environment = Object.freeze({ ...(configuration.environment ?? process.env) });
    this.buildArguments = configuration.buildArguments;
  }

  async encode(request) {
    assertEncodeRequest(request);
    const started = performance.now();
    let frameCount = 0;
    const args = await this.buildArguments(request);
    if (!Array.isArray(args) || !args.every((value) => typeof value === 'string')) {
      throw new Error(`Review proxy encoding backend ${this.id} produced invalid process arguments.`);
    }
    await executeStreaming(this.executable, args, {
      env: this.environment,
      signal: request.signal,
      timeoutMs: request.timeoutMs ?? 3 * 60 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      onStdoutLine: (line) => {
        const [key, value] = splitKeyValue(line);
        if (key === 'frame') frameCount = integer(value, frameCount);
        if (key === 'out_time_us') {
          request.onProgress?.({ frameCount, outTimeUs: Number(value) });
        }
      },
    });
    return Object.freeze({
      frameCount,
      elapsedMs: performance.now() - started,
      backendId: this.id,
      fallbackUsed: false,
    });
  }
}

export class FallbackReviewProxyEncoder {
  constructor(primary, fallback) {
    this.primary = assertReviewProxyEncoder(primary);
    this.fallback = assertReviewProxyEncoder(fallback);
    if (this.primary.id === this.fallback.id) {
      throw new Error('Primary and fallback review proxy encoders must have distinct identifiers.');
    }
    this.id = `fallback-${this.primary.id}`;
    assertReviewProxyEncoder(this);
  }

  async encode(request) {
    assertEncodeRequest(request);
    try {
      const primaryResult = await runAttempt(this.primary, request);
      return Object.freeze({ ...primaryResult, backendId: this.primary.id, fallbackUsed: false });
    } catch (error) {
      if (error?.name === 'AbortError' || request.signal?.aborted) throw error;
      request.onAttempt?.({
        backendId: this.primary.id,
        status: 'failed',
        error: boundedError(error),
      });
      await rm(request.destination, { force: true });
      const fallbackResult = await runAttempt(this.fallback, request);
      return Object.freeze({ ...fallbackResult, backendId: this.fallback.id, fallbackUsed: true });
    }
  }
}

export class PolicyReviewProxyEncoder {
  constructor(configuration) {
    if (!configuration || typeof configuration.select !== 'function') {
      throw new Error('Review proxy encoding policy requires a selector.');
    }
    this.id = configuration.id ?? 'policy-review-proxy-v1';
    this.select = configuration.select;
    this.software = assertReviewProxyEncoder(configuration.software);
    this.accelerated = assertReviewProxyEncoder(configuration.accelerated);
    assertReviewProxyEncoder(this);
  }

  async encode(request) {
    assertEncodeRequest(request);
    let selection;
    try {
      selection = await this.select(request);
      if (!selection || typeof selection.accelerated !== 'boolean') {
        throw new Error('Review proxy encoding policy returned an invalid selection.');
      }
    } catch (error) {
      if (error?.name === 'AbortError' || request.signal?.aborted) throw error;
      request.onAttempt?.({
        backendId: this.accelerated.id,
        status: 'failed',
        error: boundedError(error),
      });
      const result = await runAttempt(this.software, request);
      return Object.freeze({ ...result, backendId: this.software.id, fallbackUsed: true });
    }
    if (!selection.accelerated) {
      const result = await runAttempt(this.software, request);
      return Object.freeze({ ...result, backendId: this.software.id, fallbackUsed: false });
    }
    const result = await this.accelerated.encode({ ...request, accelerationContext: selection.context });
    assertEncodeResult(result, this.accelerated.id);
    return result;
  }
}

async function runAttempt(backend, request) {
  request.onAttempt?.({ backendId: backend.id, status: 'started' });
  const result = await backend.encode(request);
  assertEncodeResult(result, backend.id);
  if (Number.isSafeInteger(request.canonicalFrameCount) &&
      result.frameCount !== request.canonicalFrameCount) {
    throw new Error(
      `Review proxy encoding backend ${backend.id} produced ${result.frameCount} frames; ` +
      `expected ${request.canonicalFrameCount}.`);
  }
  request.onAttempt?.({ backendId: backend.id, status: 'succeeded', elapsedMs: result.elapsedMs });
  return result;
}

function assertEncodeRequest(value) {
  if (!value || typeof value !== 'object' || typeof value.destination !== 'string' || !value.destination) {
    throw new Error('Review proxy encode request requires a destination path.');
  }
}

function assertEncodeResult(value, backendId) {
  if (!value || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1 ||
      !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0) {
    throw new Error(`Review proxy encoding backend ${backendId} returned an invalid result.`);
  }
}

function boundedError(error) {
  return String(error?.message ?? error).slice(0, 512);
}

function splitKeyValue(line) {
  const separator = line.indexOf('=');
  return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
