import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createCodedRgbFrame, FRAME_HEIGHT, FRAME_WIDTH } from '../src/tooling/frame-code.mjs';
import { inspectFixture, loadResolvedDependencies } from '../src/tooling/fixture-oracle.mjs';
import { execute } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(spikeRoot, 'fixtures', 'generated');
const sourceRoot = path.join(outputRoot, 'source-frames');
const resolved = await loadResolvedDependencies(spikeRoot);
await mkdir(sourceRoot, { recursive: true });

const sourceFrameCount = 72;
for (let frameIndex = 0; frameIndex < sourceFrameCount; frameIndex += 1) {
  const ppm = Buffer.concat([
    Buffer.from(`P6\n${FRAME_WIDTH} ${FRAME_HEIGHT}\n255\n`, 'ascii'),
    createCodedRgbFrame(frameIndex),
  ]);
  await writeFile(path.join(sourceRoot, `frame-${String(frameIndex).padStart(4, '0')}.ppm`), ppm);
}

const inputPattern = path.join(sourceRoot, 'frame-%04d.ppm');
const fixtureDefinitions = [
  { id: 'cfr-ffv1', file: 'cfr-ffv1.mkv', args: ['-framerate', '24', '-i', inputPattern, '-frames:v', '72', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p'] },
  { id: 'bframes-long-gop', file: 'bframes-long-gop.mp4', args: ['-framerate', '24', '-i', inputPattern, '-frames:v', '72', '-c:v', 'libx264', '-preset', 'medium', '-g', '48', '-bf', '3', '-pix_fmt', 'yuv420p'] },
  { id: 'nonzero-start', file: 'nonzero-start.mkv', args: ['-framerate', '24', '-i', inputPattern, '-frames:v', '72', '-output_ts_offset', '5', '-c:v', 'ffv1', '-pix_fmt', 'yuv444p'] },
  { id: 'rotated', file: 'rotated.mp4', args: ['-framerate', '24', '-i', inputPattern, '-frames:v', '72', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-metadata:s:v:0', 'rotate=90'] },
  { id: 'interlaced', file: 'interlaced.mpg', args: ['-framerate', '25', '-i', inputPattern, '-frames:v', '72', '-c:v', 'mpeg2video', '-flags', '+ildct+ilme', '-top', '1', '-q:v', '2'] },
];

const concatPath = path.join(outputRoot, 'vfr.concat');
const concatLines = [];
for (let frameIndex = 0; frameIndex < sourceFrameCount; frameIndex += 1) {
  const framePath = path.join(sourceRoot, `frame-${String(frameIndex).padStart(4, '0')}.ppm`).replaceAll("'", "'\\''");
  concatLines.push(`file '${framePath}'`, `duration ${[0.04, 0.08, 0.12][frameIndex % 3]}`);
}
concatLines.push(`file '${path.join(sourceRoot, 'frame-0071.ppm')}'`);
await writeFile(concatPath, `${concatLines.join('\n')}\n`);
fixtureDefinitions.push({ id: 'vfr-ffv1', file: 'vfr-ffv1.mkv', args: ['-f', 'concat', '-safe', '0', '-i', concatPath, '-vsync', 'vfr', '-c:v', 'ffv1', '-pix_fmt', 'yuv444p'] });

for (const definition of fixtureDefinitions) {
  const outputPath = path.join(outputRoot, definition.file);
  console.log(`Encoding ${definition.id}...`);
  await execute(resolved.ffmpeg.path, ['-y', '-v', 'error', ...definition.args, outputPath], { timeoutMs: 120_000 });
}

const baseBytes = await readFile(path.join(outputRoot, 'cfr-ffv1.mkv'));
await writeFile(path.join(outputRoot, 'malformed-truncated.mkv'), baseBytes.subarray(0, Math.min(512, baseBytes.length)));

const fixtures = [];
for (const definition of fixtureDefinitions) {
  const oracle = await inspectFixture(resolved.ffmpeg.path, resolved.ffprobe.path, path.join(outputRoot, definition.file));
  const sourceCodes = oracle.frames.map((frame) => frame.sourceCode);
  const duplicateSourceCodes = sourceCodes.filter((code, index) => sourceCodes.indexOf(code) !== index);
  fixtures.push({ id: definition.id, expectedFailure: false, duplicateSourceCodes, ...oracle });
}
fixtures.push({ id: 'malformed-truncated', path: path.join(outputRoot, 'malformed-truncated.mkv'), expectedFailure: true });

const manifest = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  seed: 'coded-gradient-v1',
  normalization: 'FFmpeg noautorotate decode to packed RGBA; fixed-cell binary code with parity.',
  fixtures,
};
await writeFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated and independently decoded ${fixtures.length} fixture(s).`);
