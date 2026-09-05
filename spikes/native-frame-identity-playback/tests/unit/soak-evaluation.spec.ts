import { describe, expect, it } from 'vitest';
import { summarizeSoak } from '../../src/tooling/soak-evaluation.mjs';

function healthyEvidence() {
  const names = ['electron.exe', 'bestsource_media_service.exe', 'libvlc_media_service.exe'];
  return {
    requestedSeconds: 10, elapsedMs: 10001, cycles: 2, heldFrames: 8, playbackFrames: 40,
    soakStartedAt: '2026-08-30T10:00:00.000Z', soakFinishedAt: '2026-08-30T10:00:11.000Z',
    reopen: { identical: true, pointCount: 5, rangeCount: 2 },
    queueSamples: [{ progressiveQueueDepth: 2, exact: { pendingRequests: 1, terminated: false }, playback: { terminated: false } }],
    resourceSamples: [0, 2, 4, 6, 8, 10].map((second) => ({
      at: `2026-08-30T10:00:${String(second).padStart(2, '0')}.000Z`,
      processes: names.map((name, index) => ({ pid: index + 1, name, workingSetBytes: 100_000_000,
        privateBytes: 120_000_000, cpuSeconds: second / 2 })),
    })),
    operations: [{ kind: 'forward-step', elapsedMs: 10 }, { kind: 'forward-step', elapsedMs: 20 }],
  };
}

describe('Electron soak evidence gate', () => {
  it('accepts complete mixed-operation evidence with stable memory and bounded queues', () => {
    const result = summarizeSoak(healthyEvidence());
    expect(result.pass).toBe(true);
    expect(result.timings['forward-step']).toEqual({ count: 2, p50Ms: 10, p95Ms: 20, maxMs: 20 });
    expect(result.memory).toHaveLength(3);
  });

  it('rejects a short run and changed boundary evidence', () => {
    const evidence = healthyEvidence();
    evidence.elapsedMs = 4000;
    evidence.reopen.identical = false;
    expect(summarizeSoak(evidence).errors).toEqual(expect.arrayContaining([
      'Requested soak duration not completed.', 'Reopen identity/pixel evidence incomplete.',
    ]));
  });

  it('rejects queue growth and missing native process observations', () => {
    const evidence = healthyEvidence();
    evidence.queueSamples[0].progressiveQueueDepth = 3;
    evidence.resourceSamples.forEach((sample) => { sample.processes = sample.processes.slice(0, 1); });
    const result = summarizeSoak(evidence);
    expect(result.pass).toBe(false);
    expect(result.errors).toContain('Native queue or process-health gate failed.');
    expect(result.errors).toContain('No resource evidence for bestsource_media_service.exe');
  });

  it('flags sustained private memory growth instead of hiding it behind a successful journey', () => {
    const evidence = healthyEvidence();
    evidence.resourceSamples.forEach((sample, index) => {
      sample.processes[0].privateBytes += index * 70 * 1048576;
    });
    expect(summarizeSoak(evidence).memory[0].suspiciousGrowth).toBe(true);
    expect(summarizeSoak(evidence).pass).toBe(false);
  });

  it('rejects a slow adjacent proxy step even when the correct picture eventually arrives', () => {
    const evidence = { ...healthyEvidence(), playbackAssetKind: 'review-proxy' };
    evidence.operations.push({ kind: 'forward-step', elapsedMs: 8752 });
    expect(summarizeSoak(evidence).errors).toContain('Prepared-proxy forward-step exceeded 500 ms.');
  });
});
