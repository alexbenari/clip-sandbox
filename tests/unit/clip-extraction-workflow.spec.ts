// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

import { ClipExtractionWorkflow } from '../../src/app/clip-extraction-workflow.js';

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
      open: vi.fn(async () => ({ destinationHandle: 'destination_opaque_0001', collectionFilename: 'Sample Movie.txt' })),
      publishCreatedMedia: vi.fn(async () => undefined),
      retryPublication: vi.fn(async () => undefined),
    },
  };
}

describe('ClipExtractionWorkflow', () => {
  it('snapshots exact eligible ranges at batch start and processes them sequentially', async () => {
    const fakesForWorkflow = fakes();
    const eligible = [range('range-1', 10), range('range-2', 20)];
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    const run = workflow.extractAll({
      sourceHandle: 'source_opaque_0001',
      sourceGeneration: 1,
      ranges: eligible,
      collectionName: 'Sample Movie',
    });
    eligible.push(range('range-added-after-start', 30));
    await run;

    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledTimes(2);
    expect(fakesForWorkflow.extractor.extract.mock.invocationCallOrder[0]).toBeLessThan(fakesForWorkflow.extractor.extract.mock.invocationCallOrder[1]!);
    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-2')).toMatchObject({ kind: 'completed' });
    expect(workflow.state('range-added-after-start')).toMatchObject({ kind: 'pending' });
  });

  it('continues after one extraction failure while preserving successful entries and exposing the failed entry', async () => {
    const fakesForWorkflow = fakes();
    fakesForWorkflow.extractor.extract
      .mockResolvedValueOnce({ kind: 'created-media', mediaHandle: 'media-1', filename: 'range-1.mp4' })
      .mockRejectedValueOnce(new Error('encode failed'))
      .mockResolvedValueOnce({ kind: 'created-media', mediaHandle: 'media-3', filename: 'range-3.mp4' });
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);

    await workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, ranges: [range('range-1', 10), range('range-2', 20), range('range-3', 30)], collectionName: 'Sample Movie' });

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

    await workflow.extractOne({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, range: range('range-1', 10), collectionName: 'Sample Movie' });
    expect(workflow.state('range-1')).toMatchObject({ kind: 'publication-failed' });
    await workflow.retryPublication('range-1');

    expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce();
    expect(workflow.state('range-1')).toMatchObject({ kind: 'completed' });
  });

  it('cancels the current extraction and leaves pending entries actionable', async () => {
    const fakesForWorkflow = fakes();
    let releaseCurrent!: () => void;
    fakesForWorkflow.extractor.extract.mockImplementationOnce(() => new Promise(resolve => { releaseCurrent = () => resolve({ kind: 'created-media', mediaHandle: 'media-1', filename: 'range-1.mp4' }); }));
    const workflow = new ClipExtractionWorkflow(fakesForWorkflow.extractor, fakesForWorkflow.destination);
    const run = workflow.extractAll({ sourceHandle: 'source_opaque_0001', sourceGeneration: 1, ranges: [range('range-1', 10), range('range-2', 20)], collectionName: 'Sample Movie' });

    await vi.waitFor(() => expect(fakesForWorkflow.extractor.extract).toHaveBeenCalledOnce());
    await workflow.cancel();
    releaseCurrent();
    await run;

    expect(workflow.state('range-1')).toMatchObject({ kind: 'cancelled' });
    expect(workflow.state('range-2')).toMatchObject({ kind: 'pending' });
  });
});
