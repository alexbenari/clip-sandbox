import { existsSync } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FrameReviewHost, type IFrameReviewRuntimeConfiguration } from '../../../src/frame-review/host/frame-review-host.js';
import { NativeCommandProcess } from '../../../src/frame-review/host/native-process-client.js';
import type { HostFrameReviewEvent } from '../../../src/frame-review/host/review-session.js';

const project = path.resolve('.');
const dependenciesPath = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
const nativeBin = path.join(project, 'native-build', 'frame-review', 'bin');
const available = process.platform === 'win32'
  && existsSync(dependenciesPath)
  && existsSync(path.join(nativeBin, 'bestsource_media_service.exe'));

describe.runIf(available)('prepared review production integration', () => {
  it('builds once, reuses in-process, and reuses after a host restart without touching cache mtimes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-ms3-'));
    const dependencyManifest = JSON.parse(await readFile(dependenciesPath, 'utf8'));
    const environment = {
      ...process.env,
      PATH: [
        dependencyManifest.ffmpeg.runtimeDllRoot,
        dependencyManifest.compiler.runtimeDllRoot,
        path.join(dependencyManifest.bestsource.root, 'bin'),
        process.env.PATH ?? '',
      ].join(path.delimiter),
      VLC_PLUGIN_PATH: dependencyManifest.libvlc.plugins,
    };
    const movie = path.join(root, 'source.mp4');
    const videoBytes = Buffer.alloc(64 * 48 * 3 * 5);
    for (let frame = 0; frame < 5; frame += 1) {
      videoBytes.fill(frame * 40, frame * 64 * 48 * 3, (frame + 1) * 64 * 48 * 3);
    }
    const rawVideo = path.join(root, 'source.rgb');
    const rawAudio = path.join(root, 'source.pcm');
    await Promise.all([
      writeFile(rawVideo, videoBytes),
      writeFile(rawAudio, Buffer.alloc(48_000 * 2 * 2)),
    ]);
    await new NativeCommandProcess(environment).run(dependencyManifest.ffmpeg.path, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x48', '-framerate', '5', '-i', rawVideo,
      '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
      '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'aac', '-shortest', movie,
    ], { timeoutMs: 60_000 });

    const configuration: IFrameReviewRuntimeConfiguration = {
      applicationFolder: root,
      nativeBinaryFolder: nativeBin,
      ffmpegExecutable: dependencyManifest.ffmpeg.path,
      ffprobeExecutable: dependencyManifest.ffprobe.path,
      libVlcDll: dependencyManifest.libvlc.dll,
      libVlcPluginFolder: dependencyManifest.libvlc.plugins,
      bestSourceVersion: dependencyManifest.sources.bestsource.commit,
      ffmpegVersion: dependencyManifest.manifestSha256,
      runtimePathEntries: [
        dependencyManifest.ffmpeg.runtimeDllRoot,
        dependencyManifest.compiler.runtimeDllRoot,
        path.join(dependencyManifest.bestsource.root, 'bin'),
      ],
    };

    const first = await openPrepared(new FrameReviewHost(configuration), movie);
    expect(first.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: false } });
    expect(first.phases).toContain('proxy-encoding');
    expect(first.phases.indexOf('proxy-ready')).toBeLessThan(first.phases.indexOf('indexing'));
    const exactFrame = await first.session.enterFrameScrub();
    expect(exactFrame.identity.frameIndex).toBe(0);
    await expect(first.session.captureCurrentPoint()).resolves.toMatchObject({
      kind: 'exact-frame', identity: { frameIndex: 0 },
    });
    const manifestPath = path.join(root, 'exact-review-proxy-cache', first.session.state().preparedReview!.cacheKey, 'manifest.json');
    const firstMtime = (await stat(manifestPath)).mtimeMs;

    const second = await openPrepared(first.host, movie);
    expect(second.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: true } });
    expect(second.phases).not.toContain('proxy-encoding');
    expect(second.phases).not.toContain('proxy-ready');
    await first.session.dispose();
    await second.session.dispose();
    await first.host.dispose();

    const restarted = await openPrepared(new FrameReviewHost(configuration), movie);
    expect(restarted.session.state()).toMatchObject({ phase: 'exact-ready', preparedReview: { cacheHit: true } });
    expect(restarted.phases).not.toContain('indexing');
    expect((await stat(manifestPath)).mtimeMs).toBe(firstMtime);
    await restarted.host.dispose();
  }, 180_000);
});

async function openPrepared(host: FrameReviewHost, movie: string) {
  const phases: string[] = [];
  const sourceHandle = host.registerSource(movie);
  const session = await host.open({
    sourceHandle,
    previewBounds: { maxWidth: 320, maxHeight: 240 },
    emit: (event: HostFrameReviewEvent) => {
      if (event.type === 'state') phases.push(event.state.phase);
    },
  });
  await session.whenPrepared();
  return { host, session, phases };
}
