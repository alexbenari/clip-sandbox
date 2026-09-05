import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { summarizeSoak } from '../src/tooling/soak-evaluation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const option = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? fallback : process.argv[at + 1];
};
const target = option('--target', 'media-035');
const seconds = Number(option('--seconds', '600'));
if (!/^(media-\d+|fixture-[a-z0-9-]+)$/.test(target) || !Number.isInteger(seconds) || seconds < 10 || seconds > 3600) {
  throw new Error('Invalid soak target or duration.');
}
const fixtures = JSON.parse(await readFile(path.join(root, 'fixtures', 'manifest.json'), 'utf8'));
const prepared = JSON.parse(await readFile(path.join(root, 'artifacts', 'bestsource-preparation-raw.json'), 'utf8'));
const source = fixtures.fixtures.find((item) => `fixture-${item.id}` === target)?.path ??
  prepared.results.find((item) => item.id === target)?.sourcePath;
if (!source) throw new Error(`Unknown prepared target: ${target}`);
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const output = path.join(root, 'artifacts', `control-soak-${target}.json`);
await rm(output, { force: true });
await rm(output.replace(/\.json$/, '-stop'), { force: true });
const logPath = output.replace(/\.json$/, '.log');
const log = createWriteStream(logPath);
const electron = (await import('electron')).default;
const code = await new Promise((resolve, reject) => {
  const child = spawn(electron, [path.join(root, 'electron', 'main.cjs')], {
    cwd: root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FRAME_CONTROL_AUTO_SOURCE: source, FRAME_CONTROL_SMOKE_OUTPUT: '',
      FRAME_CONTROL_SOAK_OUTPUT: output, FRAME_CONTROL_SOAK_SECONDS: String(seconds) },
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const timeout = setTimeout(() => { child.kill(); reject(new Error(`Soak timed out; see ${logPath}`)); },
    (seconds + 2400) * 1000);
  child.on('error', (error) => { clearTimeout(timeout); reject(error); });
  child.on('close', (exitCode) => { clearTimeout(timeout); resolve(exitCode); });
});
await new Promise((resolve) => log.end(resolve));
const evidence = JSON.parse(await readFile(output, 'utf8'));
const result = { target, ...summarizeSoak(evidence), evidence: output, log: logPath };
await writeFile(output.replace(/\.json$/, '-summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (code !== 0 || !result.pass) process.exitCode = 1;
