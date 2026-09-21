// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

import { ClipExtractor, type IClipExtractionService } from '../../src/business-logic/clip-extractor.js';
import { CaptureEndpointValue } from '../../src/domain/capture-endpoint.js';
import { CapturedRangeValue } from '../../src/domain/captured-range.js';
import type { ISourceFrameIdentity } from '../../src/frame-review/model/source-frame-identity.js';

const identity = (frameIndex: number): ISourceFrameIdentity => Object.freeze({
  frameIndex,
  originalFrameIndex: frameIndex,
  pts: BigInt(frameIndex) * 1_000n,
  duration: 1_000n,
  timebaseNumerator: 1n,
  timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex) * 1_000n,
  frameInfoHash: `frame-${frameIndex}`,
});

function exactRange(sourceGeneration = 4) {
  return CapturedRangeValue.lock(
    CapturedRangeValue.id(1),
    CaptureEndpointValue.exact(identity(12), 12_000n, sourceGeneration),
    CaptureEndpointValue.exact(identity(18), 18_000n, sourceGeneration),
  );
}

function extractionService(): IClipExtractionService {
  return { extract: vi.fn(async () => ({ kind: 'created-media', mediaHandle: 'media_opaque_0001', filename: 'Sample-001.mp4' })) };
}

describe('ClipExtractor', () => {
  it('passes only opaque handles, the current generation, collection name, and inclusive exact frame ordinals', async () => {
    const service = extractionService();
    const extractor = new ClipExtractor(service);

    await extractor.extract({
      range: exactRange(),
      sourceHandle: 'source_opaque_0001',
      currentSourceGeneration: 4,
      destinationHandle: 'destination_opaque_0001',
      collectionName: 'Sample Movie',
    });

    expect(service.extract).toHaveBeenCalledWith({
      sourceHandle: 'source_opaque_0001',
      destinationHandle: 'destination_opaque_0001',
      sourceGeneration: 4,
      collectionName: 'Sample Movie',
      startFrameIndex: 12,
      endFrameIndex: 18,
    });
    expect(JSON.stringify((service.extract as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).not.toMatch(/[A-Za-z]:[\\/]|(?:^|[\\/])(?:tmp|Users|home)(?:[\\/]|$)/i);
  });

  it.each([
    ['timestamp endpoint', () => CapturedRangeValue.lock(CapturedRangeValue.id(2), CaptureEndpointValue.timestamp(12_000n, 4), CaptureEndpointValue.exact(identity(18), 18_000n, 4))],
    ['stale source generation', () => exactRange(3)],
    ['missing source handle', () => exactRange()],
    ['missing destination handle', () => exactRange()],
  ])('rejects %s without calling the extraction service', async (label, makeRange) => {
    const service = extractionService();
    const extractor = new ClipExtractor(service);
    const input = {
      range: makeRange(),
      sourceHandle: label === 'missing source handle' ? '' : 'source_opaque_0001',
      currentSourceGeneration: label === 'stale source generation' ? 4 : 4,
      destinationHandle: label === 'missing destination handle' ? '' : 'destination_opaque_0001',
      collectionName: 'Sample Movie',
    };

    await expect(extractor.extract(input)).rejects.toThrow();
    expect(service.extract).not.toHaveBeenCalled();
  });

  it('rejects invalid collection names before service extraction', async () => {
    const service = extractionService();
    const extractor = new ClipExtractor(service);

    await expect(extractor.extract({
      range: exactRange(),
      sourceHandle: 'source_opaque_0001',
      currentSourceGeneration: 4,
      destinationHandle: 'destination_opaque_0001',
      collectionName: 'bad/name',
    })).rejects.toThrow();

    expect(service.extract).not.toHaveBeenCalled();
  });
});
