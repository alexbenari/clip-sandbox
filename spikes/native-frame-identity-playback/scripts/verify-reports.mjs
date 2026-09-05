import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { summarizeSoak } from '../src/tooling/soak-evaluation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const refresh = process.argv.includes('--refresh');
const archived = process.argv.includes('--archived');
if (refresh && archived) throw new Error('Cannot refresh evidence without reading the raw artifacts.');
const json = async (file) => JSON.parse((await readFile(path.join(root, file), 'utf8')).replace(/^\uFEFF/, ''));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requireFact = (condition, message) => { if (!condition) throw new Error(message); };
const identitySequence = (frames) => frames.map(({ requestedFrame, originalFrame, pts, duration,
  timebase, rgbaHash, frameInfoHash }) => ({ requestedFrame, originalFrame, pts, duration,
  timebase, rgbaHash, frameInfoHash }));
const manifest = await json('dependency-manifest.json');
const lock = await json('package-lock.json');
for (const [name, pin] of Object.entries(manifest.dependencies)) {
  requireFact(pin.version && pin.license && pin.sourceUrl?.startsWith('https://'), `Incomplete dependency: ${name}`);
  if (pin.kind === 'binaryArchive') requireFact(/^[a-f0-9]{128}$/.test(pin.sha512), `Missing binary hash: ${name}`);
  if (pin.kind === 'gitSource') requireFact(/^[a-f0-9]{40}$/.test(pin.commit ?? '') ||
    /^[a-f0-9]{128}$/.test(pin.sourceArchiveSha512 ?? ''), `Missing source pin/hash: ${name}`);
  if (pin.kind === 'vcpkgPackage') requireFact(/^[a-f0-9]{128}$/.test(pin.sourceArchiveSha512 ?? '') && pin.pinSource,
    `Missing port source hash: ${name}`);
  if (pin.kind === 'npmPackage') requireFact(lock.packages[`node_modules/${pin.package}`]?.version === pin.version &&
    lock.packages[`node_modules/${pin.package}`]?.integrity, `Missing npm lock integrity: ${name}`);
  if (pin.pinSource && !archived) {
    const location = /^vcpkg:([a-f0-9]{40})\/ports\/([a-z0-9-]+)$/.exec(pin.pinSource);
    requireFact(location?.[1] === manifest.dependencies.vcpkg.commit, `Wrong port baseline: ${name}`);
    const port = await readFile(path.join(root, '.deps', 'vcpkg-source', 'ports', location[2], 'portfile.cmake'), 'utf8');
    requireFact(/SHA512\s+([a-f0-9]{128})/i.exec(port)?.[1] === pin.sourceArchiveSha512,
      `Pinned port source hash differs: ${name}`);
  }
}

// Only final reports are normative. Historical reports retain their original scope and failed gates.
const reports = ['README.md', 'docs/spike-results.md', 'docs/bridge-results.md',
  'docs/playback-architecture-options.md', 'docs/cross-platform-packaging.md',
  'docs/architecture-diagram.md', 'docs/frame-scrub-supporting-player-control-integration-handoof.md', 'docs/cleanup-results.md'];
let checkedLinks = 0;
for (const file of reports) {
  const body = await readFile(path.join(root, file), 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!href || /^https?:/.test(href)) continue;
    if (href.endsWith('closeout-evidence.json') && refresh) continue;
    await access(path.resolve(root, path.dirname(file), decodeURIComponent(href)));
    checkedLinks++;
  }
}

const snapshotPath = 'docs/closeout-evidence.json';
const artifactNames = ['media-inventory.json', 'libvlc-gate-raw.json', 'bestsource-gate-raw.json',
  'bestsource-preparation-raw.json', 'review-proxy-profile-raw.json',
  'preparation-acceleration-60s-media-035-raw.json', 'control-soak-media-035.json',
  'ms7-ffmpeg-path-evidence.json', 'cleanup-summary.json'];
let snapshot;
if (archived) {
  snapshot = await json(snapshotPath);
  requireFact(snapshot.schemaVersion === 1 && snapshot.coverage.length === snapshot.representativeCount,
    'Incomplete archived coverage.');
  requireFact(new Set(snapshot.coverage.map((row) => row.signature)).size === snapshot.representativeCount,
    'Duplicate archived signatures.');
  requireFact(snapshot.coverage.every((row) => row.stable && row.sourceName && row.runStartedAt),
    'Missing archived source result.');
  requireFact(snapshot.soak.pass && snapshot.soak.durationSeconds >= 600, 'Archived ten-minute soak did not pass.');
  requireFact(artifactNames.every((file) => /^[a-f0-9]{64}$/.test(snapshot.artifacts[file] ?? '')),
    'Missing raw-evidence digest.');
  requireFact(snapshot.dependencyManifestSha256 === sha256(await readFile(path.join(root, 'dependency-manifest.json'))),
    'Dependency manifest changed since evidence snapshot.');
} else {
  const artifacts = {};
  const data = {};
  for (const name of artifactNames) {
    const bytes = await readFile(path.join(root, 'artifacts', name));
    artifacts[name] = sha256(bytes);
    data[name] = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  }
  const inventory = data['media-inventory.json'];
  const runs = data['bestsource-gate-raw.json'].runs;
  const fixtureRun = runs.findLast((run) => run.mode === 'fixtures-only');
  requireFact(fixtureRun?.fixtureResults.length === 6 && fixtureRun.decision.fixturePass &&
    fixtureRun.decision.failurePass, 'Latest generated-fixture native regression did not pass.');
  const coverage = inventory.groups.map((group) => {
    const run = [...runs].reverse().find((candidate) => candidate.mediaResults.some((row) =>
      row.id === group.id && row.path === group.representativePath && row.signature === group.signature));
    const row = run?.mediaResults.find((candidate) => candidate.id === group.id);
    requireFact(row, `No measured result for ${group.id}: ${group.representativePath}`);
    const stable = row.passed && row.first?.completed && row.reopen?.completed && row.stability?.pass &&
      row.first.identities?.length >= 3 && row.reopen.identities?.length >= 3 &&
      JSON.stringify(identitySequence(row.first.identities)) === JSON.stringify(identitySequence(row.reopen.identities));
    requireFact(stable, `Exact decode/reopen failed for ${group.id}`);
    return { id: group.id, signature: group.signature, sourceName: path.win32.basename(row.path), stable,
      numFrames: row.first.numFrames, runStartedAt: run.startedAtUtc,
      originalWarmLatencyGatePassed: row.reopen.p95AccessMs <= 750, p95AccessMs: row.reopen.p95AccessMs,
      scope: 'Native original-source access and reopen; not full Electron/proxy coverage.' };
  });
  const prepared = data['bestsource-preparation-raw.json'];
  requireFact(['normalization', 'indexing'].every((phase) => prepared.cancellation?.[phase]?.acknowledged &&
    !prepared.cancellation[phase].validEntryPublished && prepared.cancellation[phase].elapsedMs <= 2000),
  'Preparation cancellation evidence failed.');
  requireFact(prepared.targetIds.length === prepared.results.length && prepared.results.every((row) =>
    row.status === 'complete' && row.randomAccess?.identityPass &&
    (!['timestamp-normalization', 'healthy-control'].includes(row.kind) || row.heldStep?.pass) &&
    row.cacheHit && row.cacheReopen?.reopen?.identityPass && row.activeIndexCount === 1 &&
    (row.kind !== 'fixture' || row.fixtureIdentity?.pass) &&
    (!row.identityComparison || (row.identityComparison.completeHashOrderPreserved &&
      row.identityComparison.frameCountPreserved))),
  'Prepared-review target or normalization evidence failed.');
  const profiles = data['review-proxy-profile-raw.json'];
  requireFact(profiles.results.length >= 27 && profiles.results.every((row) => row.status === 'complete' &&
    row.frameMap?.complete && row.frameProbe?.pass && row.audio?.expected),
    'Review-proxy profile evidence incomplete.');
  const soak = summarizeSoak(data['control-soak-media-035.json']);
  requireFact(soak.pass && soak.durationSeconds >= 600, `Ten-minute soak failed: ${soak.errors.join('; ')}`);
  snapshot = { schemaVersion: 1, generatedAtUtc: new Date().toISOString(),
    dependencyManifestSha256: sha256(await readFile(path.join(root, 'dependency-manifest.json'))),
    artifacts, inventoryGeneratedAtUtc: inventory.generatedAtUtc, representativeCount: coverage.length,
    coverage, preparationCount: prepared.results.length,
    preparationLegacyInitialProbeFlags: prepared.results.filter((row) => row.reopen?.identityPass === false).map((row) => row.id),
    profileCount: profiles.results.length,
    fixtureRegression: { completedAtUtc: fixtureRun.completedAtUtc, fixtureCount: fixtureRun.fixtureResults.length,
      identityPass: fixtureRun.decision.fixturePass, failurePathsPass: fixtureRun.decision.failurePass }, soak };
  if (refresh) await writeFile(path.join(root, snapshotPath), JSON.stringify(snapshot, null, 2) + '\n');
  else {
    const saved = await json(snapshotPath);
    requireFact(JSON.stringify(saved.artifacts) === JSON.stringify(artifacts), 'Raw evidence changed. Review it, then use --refresh.');
    requireFact(saved.dependencyManifestSha256 === snapshot.dependencyManifestSha256, 'Dependency manifest changed. Review and refresh.');
  }
}
console.log(JSON.stringify({ mode: archived ? 'archived-summary-only' : 'raw-evidence-verified',
  representatives: snapshot.representativeCount, soakSeconds: snapshot.soak.durationSeconds,
  dependencyPins: Object.keys(manifest.dependencies).length, checkedLinks, pass: true }));
