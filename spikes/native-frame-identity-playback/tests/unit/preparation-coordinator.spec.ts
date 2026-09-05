import { describe, expect, it, vi } from 'vitest';

import { PreparationCoordinator } from '../../src/preparation/preparation-coordinator.mjs';

function scan(overrides = {}) {
  return {
    type: 'packet-scan',
    codec: 'mpeg4',
    packetCount: 10,
    keyPacketCount: 2,
    keyPacketsWithPts: 2,
    packetPayloadDigest: 'same-pictures',
    ...overrides,
  };
}

describe('preparation coordinator', () => {
  it('publishes one exact-ready source and index for healthy media', async () => {
    const publish = vi.fn(async (entry) => entry);
    const coordinator = new PreparationCoordinator({
      scan: vi.fn(async () => scan()),
      normalize: vi.fn(),
      index: vi.fn(async () => ({ index: 'source.bsindex' })),
      publish,
      cleanup: vi.fn(),
    });

    const prepared = await coordinator.prepare({ source: 'movie.mkv' });

    expect(prepared).toMatchObject({ reviewAsset: 'movie.mkv', index: 'source.bsindex' });
    expect(publish).toHaveBeenCalledOnce();
    expect(coordinator.state.assertExactReady()).toEqual(prepared);
  });

  it('normalizes timestamps but rejects changed compressed-picture payloads', async () => {
    const cleanup = vi.fn();
    const coordinator = new PreparationCoordinator({
      scan: vi.fn()
        .mockResolvedValueOnce(scan({ keyPacketsWithPts: 0 }))
        .mockResolvedValueOnce(scan({ packetPayloadDigest: 'changed-pictures' })),
      normalize: vi.fn(async () => ({ reviewAsset: 'review.mkv' })),
      index: vi.fn(),
      publish: vi.fn(),
      cleanup,
    });

    await expect(coordinator.prepare({ source: 'movie.avi' }))
      .rejects.toThrow('packet payload digest');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(coordinator.state.state).toBe('failed');
  });

  it('cleans partial work and never publishes when cancelled', async () => {
    const cleanup = vi.fn();
    const publish = vi.fn();
    const controller = new AbortController();
    const coordinator = new PreparationCoordinator({
      scan: vi.fn(async () => scan({ keyPacketsWithPts: 0 })),
      normalize: vi.fn(async () => {
        controller.abort();
        throw new DOMException('cancelled', 'AbortError');
      }),
      index: vi.fn(),
      publish,
      cleanup,
    });

    await expect(coordinator.prepare({ source: 'movie.avi', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(coordinator.state.state).toBe('cancelled');
  });
});
