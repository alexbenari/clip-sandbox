import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { inspectFixture, loadResolvedDependencies } from '../src/tooling/fixture-oracle.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const resolved = await loadResolvedDependencies(spikeRoot);
const manifest = JSON.parse(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));

for (const expected of manifest.fixtures.filter((fixture) => !fixture.expectedFailure)) {
  const actual = await inspectFixture(resolved.ffmpeg.path, resolved.ffprobe.path, expected.path);
  const expectedIdentity = expected.frames.map(({ sourceCode, pts, duration }) => ({ sourceCode, pts, duration }));
  const actualIdentity = actual.frames.map(({ sourceCode, pts, duration }) => ({ sourceCode, pts, duration }));
  if (JSON.stringify(actualIdentity) !== JSON.stringify(expectedIdentity)) {
    throw new Error(`Fixture ${expected.id} no longer matches its exact decoded manifest.`);
  }
  console.log(`${expected.id}: ${actual.frames.length} exact decoded frame(s)`);
}
for (const malformed of manifest.fixtures.filter((fixture) => fixture.expectedFailure)) {
  let rejected = false;
  try {
    await inspectFixture(resolved.ffmpeg.path, resolved.ffprobe.path, malformed.path);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Malformed fixture ${malformed.id} decoded without an explicit failure.`);
  console.log(`${malformed.id}: explicit decode/probe failure`);
}
console.log('FIXTURE_ORACLE_READY');
