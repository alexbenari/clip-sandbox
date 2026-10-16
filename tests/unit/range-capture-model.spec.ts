import { describe, expect, it } from 'vitest';

import { CaptureEndpoints } from '../../src/domain/capture-endpoint.js';
import { RangeCaptureModel } from '../../src/domain/range-capture-model.js';

const identity = (frameIndex: number) => Object.freeze({
  frameIndex,
  originalFrameIndex: frameIndex,
  pts: BigInt(frameIndex * 1_000),
  duration: 1_000n,
  timebaseNumerator: 1n,
  timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex * 1_000),
  frameInfoHash: frameIndex.toString(16).padStart(16, '0'),
});

describe('RangeCaptureModel', () => {
  it('starts with one exact range and no draft when built from a known range', () => {
    const exact = (frameIndex: number) => CaptureEndpoints.exact(identity(frameIndex), BigInt(frameIndex * 1_000), 2);

    const model = RangeCaptureModel.withExactRange(exact(2), exact(4), 2);

    expect(model.snapshot.ranges).toEqual([expect.objectContaining({ id: 'range-1', kind: 'ready-to-extract' })]);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: null, end: null });
    expect(model.toSavedData().nextRangeSequence).toBe(2);
    expect(() => RangeCaptureModel.withExactRange(exact(2), exact(4), 3)).toThrow('stale source generation');
  });
  it('replaces draft endpoints before A and locks an inclusive exact range', () => {
    const model = new RangeCaptureModel(4);
    model.markStart(CaptureEndpoints.exact(identity(10), 100_000n, 4));
    model.markStart(CaptureEndpoints.exact(identity(12), 120_000n, 4));
    model.markEnd(CaptureEndpoints.exact(identity(12), 120_000n, 4));

    const result = model.lockRange();

    expect(result).toMatchObject({ kind: 'locked', range: { kind: 'ready-to-extract' } });
    expect(model.snapshot.ranges).toEqual([
      expect.objectContaining({
        kind: 'ready-to-extract',
        start: expect.objectContaining({ kind: 'exact-frame', identity: expect.objectContaining({ frameIndex: 12 }) }),
        end: expect.objectContaining({ kind: 'exact-frame', identity: expect.objectContaining({ frameIndex: 12 }) }),
      }),
    ]);
  });

  it.each([
    ['exact then timestamp', CaptureEndpoints.exact(identity(10), 100_000n, 7), CaptureEndpoints.timestamp(200_000n, 7)],
    ['timestamp then exact', CaptureEndpoints.timestamp(100_000n, 7), CaptureEndpoints.exact(identity(20), 200_000n, 7)],
    ['two timestamps', CaptureEndpoints.timestamp(100_000n, 7), CaptureEndpoints.timestamp(200_000n, 7)],
  ])('derives Needs exact frames for %s', (_label, start, end) => {
    const model = new RangeCaptureModel(7);
    model.markStart(start);
    model.markEnd(end);

    expect(model.lockRange()).toMatchObject({ kind: 'locked', range: { kind: 'needs-exact-frames' } });
  });

  it('keeps the locked range immutable, ignores W, and starts a new draft on the next Q', () => {
    const model = new RangeCaptureModel(2);
    model.markStart(CaptureEndpoints.timestamp(100_000n, 2));
    model.markEnd(CaptureEndpoints.timestamp(200_000n, 2));
    const locked = model.lockRange();
    expect(locked.kind).toBe('locked');

    expect(model.markEnd(CaptureEndpoints.timestamp(300_000n, 2))).toEqual({
      kind: 'rejected', message: 'Press Q to begin a new range.',
    });
    model.markStart(CaptureEndpoints.timestamp(400_000n, 2));

    expect(model.snapshot.ranges).toHaveLength(1);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: { timestampUs: 400_000n }, end: null });
  });

  it('removes the latest locked capture without restoring it as a draft', () => {
    const model = new RangeCaptureModel(1);
    model.markStart(CaptureEndpoints.timestamp(100_000n, 1));
    model.markEnd(CaptureEndpoints.timestamp(200_000n, 1));
    const locked = model.lockRange();
    if (locked.kind !== 'locked') throw new Error('Expected a locked capture.');

    expect(model.removeRange(locked.range.id)).not.toBeNull();

    expect(model.snapshot.ranges).toHaveLength(0);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: null, end: null });
    expect(model.toSavedData()).toMatchObject({ ranges: [] });
    expect(model.toSavedData()).not.toHaveProperty('draft');
  });

  it('discards an unfinished draft while retaining locked captures', () => {
    const model = new RangeCaptureModel(1);
    model.markStart(CaptureEndpoints.timestamp(100_000n, 1));
    model.markEnd(CaptureEndpoints.timestamp(200_000n, 1));
    model.lockRange();
    model.markStart(CaptureEndpoints.timestamp(300_000n, 1));

    expect(model.discardDraft()).toBe(true);

    expect(model.snapshot.ranges).toHaveLength(1);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: null, end: null });
    expect(model.toSavedData()).not.toHaveProperty('draft');
  });

  it('rejects missing, reversed, and stale-generation endpoints without creating a range', () => {
    const model = new RangeCaptureModel(9);
    expect(model.lockRange()).toEqual({ kind: 'rejected', message: 'Mark a start and end before locking.' });
    expect(() => model.markStart(CaptureEndpoints.timestamp(1n, 8))).toThrow('source generation');
    model.markStart(CaptureEndpoints.timestamp(200n, 9));
    model.markEnd(CaptureEndpoints.timestamp(100n, 9));
    expect(model.lockRange()).toEqual({ kind: 'rejected', message: 'The end must not precede the start.' });
    expect(model.snapshot.ranges).toHaveLength(0);
  });

  it('serializes locked ranges compactly and checks exact frames only when requested', () => {
    const original = new RangeCaptureModel(1);
    original.markStart(CaptureEndpoints.exact(identity(10), 100_000n, 1));
    original.markEnd(CaptureEndpoints.exact(identity(12), 120_000n, 1));
    original.lockRange();
    original.markStart(CaptureEndpoints.exact(identity(20), 200_000n, 1));
    original.markEnd(CaptureEndpoints.timestamp(300_000n, 1));
    original.lockRange();

    const saved = original.toSavedData();
    expect(saved).toEqual({
      schemaVersion: 1,
      nextRangeSequence: 3,
      ranges: [
        {
          id: 'range-1',
          start: { kind: 'exact-frame', frameIndex: 10, frameInfoHash: '000000000000000a', reviewTimeUs: '100000' },
          end: { kind: 'exact-frame', frameIndex: 12, frameInfoHash: '000000000000000c', reviewTimeUs: '120000' },
        },
        {
          id: 'range-2',
          start: { kind: 'exact-frame', frameIndex: 20, frameInfoHash: '0000000000000014', reviewTimeUs: '200000' },
          end: { kind: 'playback-timestamp', timestampUs: '300000' },
        },
      ],
    });
    const restored = RangeCaptureModel.fromSavedData(saved, 2);
    expect(restored.snapshot.ranges.map(range => range.kind)).toEqual(['saved-exact-range', 'needs-exact-frames']);
    expect(restored.hydrateSavedRange(restored.snapshot.ranges[0]!.id, {
      start: identity(10), end: { ...identity(12), frameInfoHash: 'ffffffffffffffff' },
    })).toBeNull();
    expect(restored.snapshot.ranges[0]?.kind).toBe('saved-exact-range');
    expect(restored.hydrateSavedRange(restored.snapshot.ranges[0]!.id, { start: identity(10), end: identity(12) })?.kind)
      .toBe('ready-to-extract');
    const mixed = restored.hydrateSavedRange(restored.snapshot.ranges[1]!.id, { start: identity(20) });
    expect(mixed).toMatchObject({ kind: 'needs-exact-frames', start: { kind: 'exact-frame' } });
    expect(restored.toSavedData()).toEqual(saved);
  });

  it('restores an approximate draft without making it exact', () => {
    const original = new RangeCaptureModel(1);
    original.markStart(CaptureEndpoints.timestamp(100_000n, 1));
    original.markEnd(CaptureEndpoints.timestamp(200_000n, 1));

    const saved = original.toSavedData();
    expect(saved.draft).toEqual({
      start: { kind: 'playback-timestamp', timestampUs: '100000' },
      end: { kind: 'playback-timestamp', timestampUs: '200000' },
    });
    const restored = RangeCaptureModel.fromSavedData(saved, 2);
    expect(restored.snapshot.capture).toMatchObject({
      kind: 'draft', start: { kind: 'playback-timestamp', timestampUs: 100_000n },
      end: { kind: 'playback-timestamp', timestampUs: 200_000n },
    });
    expect(restored.lockRange()).toMatchObject({ kind: 'locked', range: { kind: 'needs-exact-frames' } });
  });

  it('resumes after the latest draft endpoint ahead of saved ranges', () => {
    const original = new RangeCaptureModel(1);
    original.markStart(CaptureEndpoints.exact(identity(10), 100_000n, 1));
    original.markEnd(CaptureEndpoints.exact(identity(12), 120_000n, 1));
    original.lockRange();
    original.markStart(CaptureEndpoints.exact(identity(20), 200_000n, 1));
    const restored = RangeCaptureModel.fromSavedData(original.toSavedData(), 2);

    expect(restored.continuationEndpoint()).toMatchObject({ kind: 'saved-exact-frame', frameIndex: 20 });
    restored.markEnd(CaptureEndpoints.timestamp(230_000n, 2));
    expect(restored.continuationEndpoint()).toMatchObject({ kind: 'playback-timestamp', timestampUs: 230_000n });
  });

  it('checks a restored exact draft before it can be locked', () => {
    const original = new RangeCaptureModel(1);
    original.markStart(CaptureEndpoints.exact(identity(10), 100_000n, 1));
    original.markEnd(CaptureEndpoints.exact(identity(12), 120_000n, 1));
    const restored = RangeCaptureModel.fromSavedData(original.toSavedData(), 2);

    expect(restored.lockRange().kind).toBe('rejected');
    expect(restored.hydrateSavedDraft({ start: identity(10), end: { ...identity(12), frameInfoHash: 'ffffffffffffffff' } })).toBe(false);
    expect(restored.hydrateSavedDraft({ start: identity(10), end: identity(12) })).toBe(true);
    expect(restored.lockRange()).toMatchObject({ kind: 'locked', range: { kind: 'ready-to-extract' } });
  });

  it('restores a mixed exact and approximate draft without upgrading the approximate endpoint', () => {
    const original = new RangeCaptureModel(1);
    original.markStart(CaptureEndpoints.exact(identity(10), 100_000n, 1));
    original.markEnd(CaptureEndpoints.timestamp(200_000n, 1));
    const restored = RangeCaptureModel.fromSavedData(original.toSavedData(), 2);

    expect(restored.lockRange().kind).toBe('rejected');
    expect(restored.hydrateSavedDraft({ start: identity(10) })).toBe(true);
    expect(restored.lockRange()).toMatchObject({ kind: 'locked', range: { kind: 'needs-exact-frames' } });
  });
});
