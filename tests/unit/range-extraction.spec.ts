import { describe, expect, it, vi } from 'vitest';

import { CapturedRangeValue, type IReadyToExtractRange } from '../../src/domain/captured-range.js';
import { CaptureEndpointValue } from '../../src/domain/capture-endpoint.js';
import type { IClipExtractionService } from '../../src/frame-review/clip-extraction-api.js';
import { GifSessionStatus } from '../../src/app/gif-session-status.js';
import { RangeExtraction } from '../../src/app/range-extraction.js';

const movie = Object.freeze({ sourceHandle: 'source_123456789', reviewSessionId: 'session_12345678', sourceGeneration: 1, movieName: 'Sample Movie.mkv' });

function frame(frameIndex: number) {
  return Object.freeze({
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
    timebaseNumerator: 1n, timebaseDenominator: 1_000n,
    frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash: frameIndex.toString(16).padStart(16, '0'),
  });
}

function readyRange(sequence: number, start: number, end: number): IReadyToExtractRange {
  return Object.freeze({
    id: CapturedRangeValue.id(sequence), kind: 'ready-to-extract', sourceGeneration: 1,
    start: CaptureEndpointValue.exact(frame(start), BigInt(start * 1_000), 1),
    end: CaptureEndpointValue.exact(frame(end), BigInt(end * 1_000), 1),
  }) as IReadyToExtractRange;
}

const media = (filename: string, warning?: string) => Object.freeze({
  kind: 'created-media' as const, mediaHandle: `media_${filename.replace(/\W/g, '').padEnd(8, '0')}`, filename,
  ...(warning ? { warning } : {}),
});

function rangeExtraction(extract: IClipExtractionService['extract'], saveCollection: IClipExtractionService['saveCollection'] = vi.fn(async () => undefined)) {
  const status = new GifSessionStatus();
  const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn() };
  const service: IClipExtractionService = {
    openExtractionDestination: vi.fn(async () => ({ destinationHandle: 'destination_12345678', folderPath: 'C:/extraction-tmp', entries: [] })),
    extract, saveCollection, cancelCurrent: vi.fn(async () => undefined),
  };
  const extraction = new RangeExtraction({ extractionService: service, status, reporter });
  extraction.startForMovie(movie.movieName);
  return { extraction, status, reporter };
}

describe('RangeExtraction', () => {
  it('reports where a completed extraction put the clips', async () => {
    const first = readyRange(1, 3, 6);
    const { extraction, status, reporter } = rangeExtraction(vi.fn(async () => media('Sample Movie-001.mp4')));

    await extraction.extractOne(movie, first, () => [first.id]);

    expect(status.message).toBe('Extraction complete');
    expect(reporter.success).toHaveBeenCalledWith('Exact clips were added to extraction-tmp.');
    expect(extraction.isCompleted(first.id)).toBe(true);
  });

  it('asks for attention when any queued range failed, including one from an earlier run', async () => {
    const first = readyRange(1, 3, 6);
    const second = readyRange(2, 8, 9);
    const extract = vi.fn()
      .mockRejectedValueOnce(new Error('Encoder stopped.'))
      .mockResolvedValueOnce(media('Sample Movie-002.mp4'));
    const { extraction, status, reporter } = rangeExtraction(extract);

    await extraction.extractOne(movie, first, () => [first.id, second.id]);
    reporter.failure.mockClear();
    await extraction.extractOne(movie, second, () => [first.id, second.id]);

    expect(status.message).toBe('Some clips need attention');
    expect(reporter.failure).toHaveBeenCalledWith('Some clips could not be completed. Retry them from Clips.');
  });

  it('reports a provenance warning once across runs', async () => {
    const first = readyRange(1, 3, 6);
    const second = readyRange(2, 8, 9);
    const extract = vi.fn()
      .mockResolvedValueOnce(media('Sample Movie-001.mp4', 'Source details could not be written into the clip.'))
      .mockResolvedValueOnce(media('Sample Movie-002.mp4'));
    const { extraction, reporter } = rangeExtraction(extract);

    await extraction.extractOne(movie, first, () => [first.id, second.id]);
    await extraction.extractOne(movie, second, () => [first.id, second.id]);

    expect(reporter.success).toHaveBeenCalledWith('Source details could not be written into the clip.', 5000);
    expect(reporter.success.mock.calls.filter(([, timeout]) => timeout === 5000)).toHaveLength(1);
  });

  it('refuses a destination change while a batch runs, and refuses a second start of the same range', async () => {
    const first = readyRange(1, 3, 6);
    let finish: (value: ReturnType<typeof media>) => void = () => undefined;
    const extract = vi.fn(() => new Promise<ReturnType<typeof media>>(resolve => { finish = resolve; }));
    const { extraction } = rangeExtraction(extract);

    const running = extraction.extractOne(movie, first, () => [first.id]);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());

    expect(() => extraction.setDestination({ kind: 'folder', folderPath: 'C:/pipelines/camera' }))
      .toThrow('Wait for the current extraction to finish.');
    expect(extraction.canStart(first.id)).toBe(false);
    finish(media('Sample Movie-001.mp4'));
    await running;
    expect(extraction.canStart(first.id)).toBe(false);
  });

  it('retries a failed collection save without extracting again, and tells its owner the state changed', async () => {
    const first = readyRange(1, 3, 6);
    const extract = vi.fn(async () => media('Sample Movie-001.mp4'));
    const saveCollection = vi.fn()
      .mockRejectedValueOnce(new Error('collection write failed'))
      .mockResolvedValueOnce(undefined);
    const { extraction } = rangeExtraction(extract, saveCollection);
    const changed = vi.fn();
    extraction.on('extractionStateChanged', changed);
    await extraction.extractOne(movie, first, () => [first.id]);
    expect(extraction.state(first.id).kind).toBe('publication-failed');

    await extraction.retryPublication(first.id, () => [first.id]);

    expect(extract).toHaveBeenCalledOnce();
    expect(extraction.isCompleted(first.id)).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('is unavailable without an extraction service', () => {
    const extraction = new RangeExtraction({ status: new GifSessionStatus() });
    extraction.startForMovie(movie.movieName);

    expect(extraction.available).toBe(false);
    expect(extraction.canStart(CapturedRangeValue.id(1))).toBe(false);
    expect(extraction.state(CapturedRangeValue.id(1)).kind).toBe('pending');
  });
});
