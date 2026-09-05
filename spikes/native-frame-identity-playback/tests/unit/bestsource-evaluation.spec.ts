import { describe, expect, it } from 'vitest';

import {
  assessBestSourceGate,
  compareIdentityMaps,
  evaluateFixture,
  summarizeBestSourceDebug,
} from '../../src/tooling/bestsource-evaluation.mjs';

const fixture = {
  timebase: { numerator: 1, denominator: 1000 },
  frames: [{ frameIndex: 0, sourceCode: 7, pts: '100', duration: '40' }],
};

const frame = {
  type: 'frame', operation: 'forward', operationIndex: 0,
  requestedFrame: 0, originalFrame: 0, sourceCode: 7, codeValid: true,
  pts: '100', frameInfoPts: '100', duration: '40',
  timebase: { numerator: 1, denominator: 1000 },
  rgbaHash: 'abc', frameInfoHash: 'def', latencyMs: 2,
};

describe('BestSource gate evaluation', () => {
  it('rejects a wrong canonical PTS even when the picture code matches', () => {
    const events = [
      { type: 'source', numFrames: 1, timebase: fixture.timebase },
      ...['forward', 'reverse', 'alternating', 'random-neighbors', 'repeat', 'boundaries']
        .map((operation) => ({ ...frame, operation, pts: operation === 'forward' ? '101' : '100' })),
    ];

    expect(evaluateFixture(fixture, events).pass).toBe(false);
  });

  it('detects identity drift across a persistent-index reopen', () => {
    const changed = { ...frame, rgbaHash: 'changed' };
    expect(compareIdentityMaps([frame], [changed]).pass).toBe(false);
  });

  it('rejects a complete exact-frame matrix that misses the warm random-access target', () => {
    const passingFixture = { passed: true };
    const run = {
      mode: 'warm-only',
      fixtureResults: Array.from({ length: 6 }, () => passingFixture),
      malformed: { passed: true },
      cancellation: { passed: true },
      forcedTermination: { passed: true },
      mediaResults: [{
        passed: true,
        first: { p95AccessMs: 2 },
        reopen: { p95AccessMs: 751 },
      }],
    };

    expect(assessBestSourceGate(run, 1)).toEqual(expect.objectContaining({
      mediaPass: true,
      warmRandomAccessPass: false,
      c2Pass: false,
    }));
  });

  it('passes only when correctness, coverage, failure handling, and warm access all pass', () => {
    const run = {
      mode: 'full',
      resetIndexes: true,
      fixtureResults: Array.from({ length: 6 }, () => ({ passed: true })),
      malformed: { passed: true },
      cancellation: { passed: true },
      forcedTermination: { passed: true },
      mediaResults: [{
        passed: true,
        first: { constructorMs: 600_000, p95AccessMs: 900 },
        reopen: { p95AccessMs: 750 },
      }],
    };

    expect(assessBestSourceGate(run, 1).c2Pass).toBe(true);
  });

  it('rejects a clean full run that exceeds the initial-indexing target', () => {
    const run = {
      mode: 'full',
      resetIndexes: true,
      fixtureResults: Array.from({ length: 6 }, () => ({ passed: true })),
      malformed: { passed: true },
      cancellation: { passed: true },
      forcedTermination: { passed: true },
      mediaResults: [{
        passed: true,
        first: { constructorMs: 600_001, p95AccessMs: 100 },
        reopen: { p95AccessMs: 100 },
      }],
    };

    expect(assessBestSourceGate(run, 1)).toEqual(expect.objectContaining({
      initialIndexingPass: false,
      c2Pass: false,
    }));
  });

  it('summarizes retry and fallback evidence from BestSource debug output', () => {
    const stderr = [
      'Req/Current: 200/100, Seek location cannot be unambiguosly identified, have to retry seeking',
      'Req/Current: 200/100, No destination frame number could be determined after seeking, added as bad seek location',
      'Req/Current: 200/50, Retrying seeking with',
      'Linear mode is now forced',
    ].join('\n');

    expect(summarizeBestSourceDebug(stderr)).toEqual(expect.objectContaining({
      lineCount: 4,
      ambiguousSeekCount: 1,
      retryCount: 1,
      badSeekLocationCount: 1,
      linearFallbackCount: 1,
    }));
  });
});
