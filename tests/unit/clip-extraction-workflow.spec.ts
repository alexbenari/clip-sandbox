// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

import { ClipExtractionWorkflow } from '../../src/app/clip-extraction-workflow.js';
import { ClipExtractor } from '../../src/business-logic/clip-extractor.js';
import { Collection } from '../../src/domain/collection.js';

type Range = { id: string; kind: 'ready-to-extract'; sourceGeneration: number; start: { kind: 'exact-frame'; identity: { frameIndex: number } }; end: { kind: 'exact-frame'; identity: { frameIndex: number } } };

const range = (id: string, startFrameIndex: number): Range => ({
  id,
  kind: 'ready-to-extract',
  sourceGeneration: 1,
  start: { kind: 'exact-frame', identity: { frameIndex: startFrameIndex } },
  end: { kind: 'exact-frame', identity: { frameIndex: startFrameIndex + 3 } },
});

function fakes() {
  return {
    extractor: { extract: vi.fn(async ({ range: current }: { range: Range }) => ({ kind: 'created-media', mediaHandle: `media-${current.id}`, filename: `${current.id}.mp4` })) },
    destination: {
      open: vi.fn(async () => ({ destinationHandle: 'destination_opaque_0001', folderPath: 'D:\\Clips', collectionFilename: 'Sample Movie.txt', collection: Collection.fromFilename({ filename: 'Sample Movie.txt' }) })),
      publishCreatedMedia: vi.fn(async () => undefined),
      retryPublication: vi.fn(async () => undefined),
    },
  };
}

describe('ClipExtractionWorkflow', () => {
  it('reports Extract all boundaries and each successful clip with elapsed extraction time', async () => {
    const ports = fakes();
    const activity: unknown[] = [];
    const workflow = new ClipExtractionWorkflow(ports.extractor, ports.destination,
      () => undefined, event => activity.push(event));

    await workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      ranges: [range('range-1', 10), range('range-2', 20)], movieName: 'Sample Movie.mp4' });

    expect(activity).toMatchObject([
      { kind: 'batch-started', total: 2 },
      { kind: 'clip-extracted', filename: 'range-1.mp4', folderPath: 'D:\\Clips' },
      { kind: 'clip-extracted', filename: 'range-2.mp4', folderPath: 'D:\\Clips' },
      { kind: 'batch-finished', total: 2, extracted: 2, cancelled: false },
    ]);
    for (const event of activity.slice(1, 3)) {
      expect(event.durationMs).toEqual(expect.any(Number));
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(event.durationMs)).toBe(true);
    }
  });

  it('reports a single extraction without Extract all boundaries', async () => {
    const ports = fakes();
    const activity: unknown[] = [];
    const workflow = new ClipExtractionWorkflow(ports.extractor, ports.destination,
      () => undefined, event => activity.push(event));
    await workflow.extractOne({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      range: range('range-1', 10), movieName: 'Sample Movie.mp4' });
    expect(activity).toMatchObject([{ kind: 'clip-extracted', filename: 'range-1.mp4' }]);
  });

  it('counts only published clips in the finished entry', async () => {
    const ports = fakes();
    ports.destination.publishCreatedMedia.mockRejectedValueOnce(new Error('collection save failed'));
    const activity: unknown[] = [];
    const workflow = new ClipExtractionWorkflow(ports.extractor, ports.destination,
      () => undefined, event => activity.push(event));
    await workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      ranges: [range('range-1', 10)], movieName: 'Sample Movie.mp4' });
    expect(workflow.state('range-1').kind).toBe('publication-failed');
    expect(activity).toEqual([
      { kind: 'batch-started', total: 1 },
      { kind: 'batch-finished', total: 1, extracted: 0, cancelled: false },
    ]);
  });

  it('extracts a movie whose filename leaves whitespace after extension removal into the opened collection', async () => {
    const extractionService = {
      extract: vi.fn(async () => ({ kind: 'created-media', mediaHandle: 'media_opaque_0001', filename: 'Sample Movie-001.mp4' })),
    };
    const destination = fakes().destination;
    const workflow = new ClipExtractionWorkflow(new ClipExtractor(extractionService), destination);

    await workflow.extractOne({
      sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      range: range('range-1', 10), movieName: 'Sample Movie .mp4',
    });

    expect(extractionService.extract).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'Sample Movie' }), expect.any(Function));
    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
  });

  it('resets completed revisions without deleting the earlier media and blocks unresolved publication', async () => {
    const fakesForWorkflow = fakes();
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);
    const request = { sourceHandle: 'source_opaque_0001', sourceGeneration: 1, range: range('range-1', 10), movieName: 'Sample Movie.mp4' };
    await workflow.extractOne(request);
    const earlierMedia = workflow.state('range-1');
    expect(earlierMedia).toMatchObject({ kind: 'completed', media: { filename: 'range-1.mp4' } });
    expect(workflow.revisionBlock('range-1')).toBeNull();
    workflow.resetForRevision('range-1');
    expect(workflow.state('range-1')).toEqual({ kind: 'pending' });
    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce();

    fakesForWorkflow.destination.publishCreatedMedia.mockRejectedValueOnce(new Error('save failed'));
    await workflow.extractOne({ ...request, range: range('range-1', 12) });
    expect(workflow.state('range-1')).toMatchObject({ kind: 'publication-failed' });
    expect(workflow.revisionBlock('range-1')).toContain('Retry');
    expect(() => workflow.resetForRevision('range-1')).toThrow('Retry');
    expect(workflow.state('range-1')).toMatchObject({ kind: 'publication-failed' });
  });

  it('blocks revision while a batch has a snapshot of pending work', async () => {
    const fakesForWorkflow = fakes();
    let releaseOpen!: () => void;
    fakesForWorkflow.destination.open.mockImplementationOnce(() => new Promise(resolve => {
      releaseOpen = () => resolve({ destinationHandle: 'destination_opaque_0001', collectionFilename: 'Sample Movie.txt', collection: Collection.fromFilename({ filename: 'Sample Movie.txt' }) });
    }));
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);
    const run = workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      ranges: [range('range-1', 10), range('range-2', 20)], movieName: 'Sample Movie.mp4' });
    expect(workflow.state('range-2')).toEqual({ kind: 'pending' });
    expect(workflow.revisionBlock('range-2')).toContain('Wait');
    await expect(workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      ranges: [range('range-2', 20)], movieName: 'Sample Movie.mp4' })).rejects.toThrow('already running');
    expect(workflow.batchProgress?.total).toBe(2);
    releaseOpen();
    await run;
    expect(workflow.revisionBlock('range-2')).toBeNull();
  });
  it('extracts only the ranges eligible when the batch started', async () => {
    const fakesForWorkflow = fakes();
    const eligible = [range('range-1', 10), range('range-2', 20)];
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    const run = workflow.extractAll({
      sourceHandle: 'source_opaque_0001',
      sourceGeneration: 1,
      ranges: eligible,
      movieName: 'Sample Movie.mp4',
    });
    eligible.push(range('range-added-after-start', 30));
    await run;

    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-2')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-added-after-start')).toMatchObject({ kind: 'pending' });
  });

  it('starts the next range only after the current extraction finishes', async () => {
    const fakesForWorkflow = fakes();
    let finishFirst!: () => void;
    fakesForWorkflow.extractor.extract.mockImplementationOnce(() => new Promise(resolve => {
      finishFirst = () => resolve({ kind: 'created-media', mediaHandle: 'media-range-1', filename: 'range-1.mp4' });
    }));
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    const run = workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      ranges: [range('range-1', 10), range('range-2', 20)], movieName: 'Sample Movie.mp4' });
    await vi.waitFor(() => expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce();
    finishFirst();
    await run;
    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledTimes(2);
  });

  it('continues after one extraction failure while preserving successful entries and exposing the failed entry', async () => {
    const fakesForWorkflow = fakes();
    fakesForWorkflow.extractor.extract
      .mockResolvedValueOnce({ kind: 'created-media', mediaHandle: 'media-1', filename: 'range-1.mp4' })
      .mockRejectedValueOnce(new Error('encode failed'))
      .mockResolvedValueOnce({ kind: 'created-media', mediaHandle: 'media-3', filename: 'range-3.mp4' });
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    await workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, ranges: [range('range-1', 10), range('range-2', 20), range('range-3', 30)], movieName: 'Sample Movie.mp4' });

    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledTimes(3);
    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-2')).toMatchObject({ kind: 'failed' });
    expect(workflow.state('range-3')).toMatchObject({ kind: 'completed' });
  });

  it('retries a collection publication failure without invoking extraction again', async () => {
    const fakesForWorkflow = fakes();
    fakesForWorkflow.destination.publishCreatedMedia
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined);
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    await workflow.extractOne({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, range: range('range-1', 10), movieName: 'Sample Movie.mp4' });
    expect(workflow.state('range-1')).toMatchObject({ kind: 'publication-failed' });
    await workflow.retryPublication('range-1');

    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce();
    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
  });

  it('finishes publication when cancellation races with completed media', async () => {
    const fakesForWorkflow = fakes();
    let releaseCurrent!: () => void;
    fakesForWorkflow.extractor.extract.mockImplementationOnce(() => new Promise(resolve => { releaseCurrent = () => resolve({ kind: 'created-media', mediaHandle: 'media-1', filename: 'range-1.mp4' }); }));
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);
    const run = workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, ranges: [range('range-1', 10), range('range-2', 20)], movieName: 'Sample Movie.mp4' });

    await vi.waitFor(() => expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce());
    await workflow.cancel();
    releaseCurrent();
    await run;

    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-2')).toMatchObject({ kind: 'pending' });
    expect(fakesForWorkflow.destination.publishCreatedMedia).toHaveBeenCalledOnce();
    expect(workflow.wasCancelled).toBe(true);
    await workflow.extractOne({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1,
      range: range('range-2', 20), movieName: 'Sample Movie.mp4' });
    expect(workflow.wasCancelled).toBe(false);
    expect(workflow.state('range-2')).toMatchObject({ kind: 'completed' });
  });
});
