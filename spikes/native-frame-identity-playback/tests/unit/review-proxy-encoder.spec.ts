import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  FallbackReviewProxyEncoder,
  PolicyReviewProxyEncoder,
  SOFTWARE_FFMPEG_BACKEND_ID,
  assertReviewProxyEncoder,
} from '../../src/preparation/review-proxy-encoder.mjs';

describe('review proxy encoding backend', () => {
  it('accepts the stable software backend contract and rejects incomplete implementations', () => {
    const backend = {
      id: SOFTWARE_FFMPEG_BACKEND_ID,
      encode: vi.fn(),
    };

    expect(assertReviewProxyEncoder(backend)).toBe(backend);
    expect(() => assertReviewProxyEncoder({ id: 'missing-encode' })).toThrow(/encode/);
    expect(() => assertReviewProxyEncoder({ id: '../escape', encode() {} })).toThrow(/identifier/);
  });

  it('removes a failed partial output and reports the software fallback attempt', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'proxy-encoder-fallback-'));
    const destination = path.join(root, 'proxy.mkv');
    const attempts: Array<Record<string, unknown>> = [];
    const primary = {
      id: 'hardware-test-v1',
      async encode() {
        await writeFile(destination, 'partial', 'utf8');
        throw new Error('hardware unavailable');
      },
    };
    const fallback = {
      id: SOFTWARE_FFMPEG_BACKEND_ID,
      async encode() {
        expect(await readFile(destination, 'utf8').catch(() => null)).toBeNull();
        await writeFile(destination, 'complete', 'utf8');
        return { frameCount: 42, elapsedMs: 12 };
      },
    };

    try {
      const backend = new FallbackReviewProxyEncoder(primary, fallback);
      const result = await backend.encode({
        destination,
        onAttempt: (attempt: Record<string, unknown>) => attempts.push(attempt),
      });

      expect(result).toMatchObject({
        frameCount: 42,
        backendId: SOFTWARE_FFMPEG_BACKEND_ID,
        fallbackUsed: true,
      });
      expect(attempts).toEqual([
        expect.objectContaining({ backendId: 'hardware-test-v1', status: 'started' }),
        expect.objectContaining({ backendId: 'hardware-test-v1', status: 'failed' }),
        expect.objectContaining({ backendId: SOFTWARE_FFMPEG_BACKEND_ID, status: 'started' }),
        expect.objectContaining({ backendId: SOFTWARE_FFMPEG_BACKEND_ID, status: 'succeeded' }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not convert cancellation into a fallback encode', async () => {
    const fallback = { id: SOFTWARE_FFMPEG_BACKEND_ID, encode: vi.fn() };
    const primary = {
      id: 'hardware-test-v1',
      async encode() {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    };
    const backend = new FallbackReviewProxyEncoder(primary, fallback);

    await expect(backend.encode({ destination: path.resolve('unused.mkv') })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fallback.encode).not.toHaveBeenCalled();
  });

  it('routes ordinary sources directly to software without reporting a fallback', async () => {
    const software = {
      id: SOFTWARE_FFMPEG_BACKEND_ID,
      encode: vi.fn(async () => ({ frameCount: 42, elapsedMs: 10 })),
    };
    const accelerated = {
      id: 'hardware-test-v1',
      encode: vi.fn(async () => ({ frameCount: 42, elapsedMs: 5 })),
    };
    const backend = new PolicyReviewProxyEncoder({
      software,
      accelerated,
      select: async () => ({ accelerated: false }),
    });

    const result = await backend.encode({ destination: path.resolve('unused.mkv') });

    expect(result).toMatchObject({
      backendId: SOFTWARE_FFMPEG_BACKEND_ID,
      fallbackUsed: false,
    });
    expect(software.encode).toHaveBeenCalledOnce();
    expect(accelerated.encode).not.toHaveBeenCalled();
  });

  it('enforces the canonical frame count on a policy-selected software encode', async () => {
    const backend = new PolicyReviewProxyEncoder({
      software: {
        id: SOFTWARE_FFMPEG_BACKEND_ID,
        encode: vi.fn(async () => ({ frameCount: 41, elapsedMs: 10 })),
      },
      accelerated: {
        id: 'hardware-test-v1',
        encode: vi.fn(async () => ({ frameCount: 42, elapsedMs: 5 })),
      },
      select: async () => ({ accelerated: false }),
    });

    await expect(backend.encode({
      destination: path.resolve('unused.mkv'),
      canonicalFrameCount: 42,
    })).rejects.toThrow(/produced 41 frames; expected 42/);
  });

  it('passes selector context to the accelerated backend', async () => {
    const context = { codec: 'hevc', width: 3840, height: 1606, pixelFormat: 'yuv420p10le' };
    const software = {
      id: SOFTWARE_FFMPEG_BACKEND_ID,
      encode: vi.fn(async () => ({ frameCount: 42, elapsedMs: 10 })),
    };
    const accelerated = {
      id: 'hardware-test-v1',
      encode: vi.fn(async (request) => {
        expect(request.accelerationContext).toBe(context);
        return { frameCount: 42, elapsedMs: 5, backendId: 'hardware-test-v1', fallbackUsed: false };
      }),
    };
    const backend = new PolicyReviewProxyEncoder({
      software,
      accelerated,
      select: async () => ({ accelerated: true, context }),
    });

    const result = await backend.encode({ destination: path.resolve('unused.mkv') });

    expect(result.backendId).toBe('hardware-test-v1');
    expect(accelerated.encode).toHaveBeenCalledOnce();
    expect(software.encode).not.toHaveBeenCalled();
  });
});
