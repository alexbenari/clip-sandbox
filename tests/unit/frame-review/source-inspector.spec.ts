// @vitest-environment node
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SourceInspector } from '../../../src/frame-review/host/source-inspector.js';

const built = new Date('2026-01-05T10:00:00Z');
const rebuilt = new Date('2026-02-09T16:30:00Z');
let toolFolder = '';

beforeEach(async () => {
  toolFolder = await mkdtemp(path.join(os.tmpdir(), 'source-inspector-tools-'));
  for (const tool of ['media_sample_signature.exe', 'media_packet_scan.exe', 'ffprobe.exe']) await buildTool(tool, 'build 1', built);
});

afterEach(async () => {
  await rm(toolFolder, { recursive: true, force: true });
});

async function buildTool(name: string, contents: string, time: Date) {
  const tool = path.join(toolFolder, name);
  await writeFile(tool, contents);
  await utimes(tool, time, time);
}

function inspector() {
  return new SourceInspector({
    sampleSignatureExecutable: path.join(toolFolder, 'media_sample_signature.exe'),
    packetScanExecutable: path.join(toolFolder, 'media_packet_scan.exe'),
    ffprobeExecutable: path.join(toolFolder, 'ffprobe.exe'),
    bestSourceVersion: 'bestsource-1',
    ffmpegVersion: 'ffmpeg-1',
  });
}

describe('SourceInspector tools version', () => {
  it('stays the same while the measuring tools are unchanged', async () => {
    const before = await inspector().toolsVersion();

    await expect(inspector().toolsVersion()).resolves.toBe(before);
  });

  it.each(['media_sample_signature.exe', 'media_packet_scan.exe', 'ffprobe.exe'])(
    'changes once %s is rebuilt to the same size', async tool => {
      const before = await inspector().toolsVersion();
      await buildTool(tool, 'build 2', rebuilt);

      await expect(inspector().toolsVersion()).resolves.not.toBe(before);
    });

  it('changes once a tool is rebuilt to another size with the same modification time', async () => {
    const before = await inspector().toolsVersion();
    await buildTool('media_sample_signature.exe', 'build 2, larger', built);

    await expect(inspector().toolsVersion()).resolves.not.toBe(before);
  });
});
