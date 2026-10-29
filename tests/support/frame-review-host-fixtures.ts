import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FrameReviewHost, type IFrameReviewRuntimeConfiguration } from '../../src/frame-review/host/frame-review-host.js';
import { NativeCommandProcess } from '../../src/frame-review/host/native-process-client.js';
import type { HostFrameReviewEvent } from '../../src/frame-review/host/review-session.js';
import { nativeBinaryFolder, toolEnvironment, type FrameReviewDependencies } from './frame-review-dependencies.js';
export function runtimeConfiguration(root: string, dependencies: FrameReviewDependencies): IFrameReviewRuntimeConfiguration {
  return {
    applicationFolder: root,
    nativeBinaryFolder,
    ffmpegExecutable: dependencies.ffmpeg.path,
    ffprobeExecutable: dependencies.ffprobe.path,
    libVlcDll: dependencies.libvlc.dll,
    libVlcPluginFolder: dependencies.libvlc.plugins,
    bestSourceVersion: dependencies.sources.bestsource.commit,
    ffmpegVersion: dependencies.manifestSha256,
    runtimePathEntries: [
      dependencies.ffmpeg.runtimeDllRoot,
      dependencies.compiler.runtimeDllRoot,
      path.join(dependencies.bestsource.root, 'bin'),
    ],
  };
}

export async function createFiveFrameMovie(root: string, dependencies: FrameReviewDependencies): Promise<string> {
  const movie = path.join(root, 'source.mp4');
  const videoBytes = Buffer.alloc(64 * 48 * 3 * 5);
  for (let frame = 0; frame < 5; frame += 1) {
    videoBytes.fill(frame * 40, frame * 64 * 48 * 3, (frame + 1) * 64 * 48 * 3);
  }
  const rawVideo = path.join(root, 'source.rgb');
  const rawAudio = path.join(root, 'source.pcm');
  await Promise.all([writeFile(rawVideo, videoBytes), writeFile(rawAudio, Buffer.alloc(48_000 * 2 * 2))]);
  await new NativeCommandProcess(toolEnvironment(dependencies)).run(dependencies.ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x48', '-framerate', '5', '-i', rawVideo,
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
    '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'aac', '-shortest', movie,
  ], { timeoutMs: 60_000 });
  return movie;
}

export async function openPrepared(host: FrameReviewHost, movie: string) {
  const phases: string[] = [];
  let playbackFrames = 0;
  const session = await host.open({
    sourceHandle: host.registerSource(movie),
    previewBounds: { maxWidth: 320, maxHeight: 240 },
    muted: false,
    emit: (event: HostFrameReviewEvent) => {
      if (event.type === 'state') phases.push(event.state.phase);
      if (event.type === 'display-frame' && event.frame.kind === 'playback-frame') playbackFrames += 1;
    },
  });
  await session.whenPrepared();
  return { host, session, phases, playbackFrames: () => playbackFrames };
}
