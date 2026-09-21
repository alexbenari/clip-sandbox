import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const toolRoot = path.resolve(import.meta.dirname, '..');
const buildRoot = path.join(repositoryRoot, 'native-build', 'frame-review');
const outputRoot = path.join(buildRoot, 'test-output');
const fixturePath = path.join(outputRoot, 'native-service-fixture.mkv');
const indexPath = path.join(outputRoot, 'native-service-fixture.bsindex');

const resolved = JSON.parse(await readFile(
  path.join(toolRoot, '.deps', 'resolved-dependencies.json'),
  'utf8',
));

function processEnvironment(extra = {}) {
  return {
    ...process.env,
    PATH: [
      path.join(buildRoot, 'runtime', 'media'),
      path.join(buildRoot, 'runtime', 'libvlc'),
      process.env.PATH,
    ].join(path.delimiter),
    ...extra,
  };
}

function encodeMessage(metadata) {
  const encoded = Buffer.from(JSON.stringify(metadata), 'utf8');
  const header = Buffer.alloc(16);
  header.write('FVSP', 0, 'ascii');
  header.writeUInt16LE(1, 4);
  header.writeUInt32LE(encoded.length, 8);
  return Buffer.concat([header, encoded]);
}

function decodeMessages(bytes) {
  const messages = [];
  let offset = 0;
  while (offset < bytes.length) {
    assert.equal(bytes.subarray(offset, offset + 4).toString('ascii'), 'FVSP');
    assert.equal(bytes.readUInt16LE(offset + 4), 1);
    const metadataLength = bytes.readUInt32LE(offset + 8);
    const payloadLength = bytes.readUInt32LE(offset + 12);
    const metadataStart = offset + 16;
    const payloadStart = metadataStart + metadataLength;
    const messageEnd = payloadStart + payloadLength;
    assert.ok(messageEnd <= bytes.length, 'native response must be complete');
    messages.push({
      metadata: JSON.parse(bytes.subarray(metadataStart, payloadStart).toString('utf8')),
      payload: bytes.subarray(payloadStart, messageEnd),
    });
    offset = messageEnd;
  }
  return messages;
}

async function runService(executable, args, requests, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(executable)} exceeded its 30 second test timeout.`));
    }, 30_000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(
          `${path.basename(executable)} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`,
        ));
        return;
      }
      resolve(decodeMessages(Buffer.concat(stdout)));
    });
    child.stdin.end(Buffer.concat(requests.map(encodeMessage)));
  });
}

test.before(async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const rawVideoPath = path.join(outputRoot, 'fixture.rgb');
  const rawAudioPath = path.join(outputRoot, 'fixture.pcm');
  const frames = Buffer.alloc(64 * 48 * 3 * 5);
  for (let frameIndex = 0; frameIndex < 5; frameIndex += 1) {
    for (let pixel = 0; pixel < 64 * 48; pixel += 1) {
      const offset = (frameIndex * 64 * 48 + pixel) * 3;
      frames[offset] = frameIndex * 40;
      frames[offset + 1] = pixel % 256;
      frames[offset + 2] = 255 - frameIndex * 40;
    }
  }
  const samples = Buffer.alloc(48_000 * 2);
  for (let index = 0; index < 48_000; index += 1) {
    samples.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * index / 48_000) * 8_000), index * 2);
  }
  await Promise.all([
    writeFile(rawVideoPath, frames),
    writeFile(rawAudioPath, samples),
  ]);
  const generated = spawnSync(resolved.ffmpeg.path, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x48', '-framerate', '5',
    '-i', rawVideoPath,
    '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', rawAudioPath,
    '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', '-y', fixturePath,
  ], { env: processEnvironment(), encoding: 'utf8', windowsHide: true });
  assert.equal(generated.status, 0, generated.stderr);
});

test('BestSource service provides exact frames, cache reuse, and bounded errors', async () => {
  const messages = await runService(
    path.join(buildRoot, 'bin', 'bestsource_media_service.exe'),
    [],
    [
      {
        requestId: 'bad-dimensions', command: 'open', sourcePath: fixturePath,
        indexPath, sourceGeneration: 1, maxPreviewWidth: 0, maxPreviewHeight: 48,
      },
      {
        requestId: 'open', command: 'open', sourcePath: fixturePath,
        indexPath, sourceGeneration: 1, maxPreviewWidth: 64, maxPreviewHeight: 48,
      },
      { requestId: 'first', command: 'exact', frameIndex: 0 },
      { requestId: 'cached', command: 'exact', frameIndex: 0 },
      { requestId: 'outside', command: 'exact', frameIndex: 9999 },
      { requestId: 'unknown', command: 'not-a-command' },
      { requestId: 'shutdown', command: 'shutdown' },
    ],
    processEnvironment(),
  );
  const byRequest = new Map(messages.map((message) => [message.metadata.requestId, message]));
  assert.equal(byRequest.get('bad-dimensions').metadata.error.category, 'invalid-request');
  assert.equal(byRequest.get('open').metadata.state, 'exact-ready');
  assert.equal(byRequest.get('first').metadata.identity.frameIndex, 0);
  assert.equal(byRequest.get('first').payload.length, 64 * 48 * 4);
  assert.equal(byRequest.get('cached').metadata.access.cacheHit, true);
  assert.equal(byRequest.get('outside').metadata.error.category, 'frame-boundary');
  assert.equal(byRequest.get('unknown').metadata.error.category, 'invalid-request');
});

test('LibVLC service opens, primes, and returns a bounded playback frame', async () => {
  const libVlcRoot = path.join(buildRoot, 'runtime', 'libvlc');
  const messages = await runService(
    path.join(buildRoot, 'bin', 'libvlc_media_service.exe'),
    [path.join(libVlcRoot, 'libvlc.dll')],
    [
      {
        requestId: 'open', command: 'open', sourcePath: fixturePath,
        sourceGeneration: 2, maxPreviewWidth: 64, maxPreviewHeight: 48, muted: true,
      },
      { requestId: 'prime', command: 'prime' },
      { requestId: 'shutdown', command: 'shutdown' },
    ],
    processEnvironment({ VLC_PLUGIN_PATH: path.join(libVlcRoot, 'plugins') }),
  );
  assert.equal(
    messages.find((message) => message.metadata.requestId === 'open').metadata.state,
    'playback-ready',
  );
  assert.ok(messages.some((message) => message.metadata.type === 'playback-frame'));
  const frame = messages.find((message) => message.metadata.type === 'playback-frame');
  assert.ok(frame.metadata.width > 0 && frame.metadata.height > 0);
  assert.equal(frame.payload.length, frame.metadata.payloadBytes);
  assert.ok(messages.some((message) => message.metadata.requestId === 'prime'));
});
