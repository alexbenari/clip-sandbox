export function summarizeSoak(evidence, { maxAdjacentStepMs = 500 } = {}) {
  const errors = [];
  if (evidence.error) errors.push(evidence.error);
  if (evidence.playerError) errors.push(evidence.playerError);
  if (!(evidence.elapsedMs >= evidence.requestedSeconds * 1000)) errors.push('Requested soak duration not completed.');
  if (!evidence.reopen?.identical || evidence.reopen.pointCount < 5 || evidence.reopen.rangeCount < 2) {
    errors.push('Reopen identity/pixel evidence incomplete.');
  }
  if (!evidence.cycles || !evidence.heldFrames || !evidence.playbackFrames) errors.push('Mixed-operation evidence incomplete.');
  const queues = evidence.queueSamples ?? [];
  const queuePeak = Math.max(0, ...queues.map((row) => row.progressiveQueueDepth));
  const exactRequestPeak = Math.max(0, ...queues.map((row) => row.exact.pendingRequests));
  if (!queues.length || queuePeak > 2 || exactRequestPeak > 2 || queues.some((row) => row.exact.terminated || row.playback.terminated)) {
    errors.push('Native queue or process-health gate failed.');
  }
  const resources = (evidence.resourceSamples ?? []).filter((row) =>
    row.at >= evidence.soakStartedAt && row.at <= evidence.soakFinishedAt);
  if (resources.length < Math.min(3, evidence.requestedSeconds / 2)) errors.push('Resource samples incomplete.');
  const groups = new Map();
  for (const row of resources) {
    for (const process of row.processes) {
      const key = `${process.name}:${process.pid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...process, at: row.at });
    }
  }
  const memory = [...groups].map(([process, samples]) => {
    const warm = samples.slice(Math.min(Math.floor(samples.length / 4), 30));
    const first = warm[0] ?? samples[0];
    const last = samples.at(-1);
    const deltaMiB = (last.privateBytes - first.privateBytes) / 1048576;
    const tail = warm.slice(-Math.max(3, Math.floor(warm.length / 3)));
    const tailGrowthMiB = (last.privateBytes - tail[0].privateBytes) / 1048576;
    const suspiciousGrowth = deltaMiB > 128 && tailGrowthMiB > 32;
    if (suspiciousGrowth) errors.push(`Sustained private-memory growth requires investigation: ${process}`);
    return { process, samples: samples.length,
      peakWorkingSetMiB: Math.max(...samples.map((sample) => sample.workingSetBytes)) / 1048576,
      peakPrivateMiB: Math.max(...samples.map((sample) => sample.privateBytes)) / 1048576,
      warmDeltaMiB: deltaMiB, tailGrowthMiB, suspiciousGrowth,
      cpuSeconds: last.cpuSeconds - samples[0].cpuSeconds };
  });
  for (const name of ['bestsource_media_service.exe', 'libvlc_media_service.exe', 'electron.exe']) {
    if (!memory.some((row) => row.process.startsWith(name + ':'))) errors.push(`No resource evidence for ${name}`);
  }
  const timings = {};
  for (const kind of new Set((evidence.operations ?? []).map((row) => row.kind))) {
    const values = evidence.operations.filter((row) => row.kind === kind).map((row) => row.elapsedMs).sort((a, b) => a - b);
    timings[kind] = { count: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: values.at(-1) };
  }
  if (evidence.playbackAssetKind === 'review-proxy') {
    for (const kind of ['forward-step', 'reverse-step']) {
      if (timings[kind]?.maxMs > maxAdjacentStepMs) {
        errors.push(`Prepared-proxy ${kind} exceeded ${maxAdjacentStepMs} ms.`);
      }
    }
  }
  return { pass: errors.length === 0, errors, durationSeconds: evidence.elapsedMs / 1000,
    cycles: evidence.cycles, heldFrames: evidence.heldFrames, playbackFrames: evidence.playbackFrames,
    queuePeak, exactRequestPeak, resourceSamples: resources.length, memory, timings,
    reopen: evidence.reopen && { identical: evidence.reopen.identical, pointCount: evidence.reopen.pointCount, rangeCount: evidence.reopen.rangeCount } };
}

function percentile(values, fraction) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
}
