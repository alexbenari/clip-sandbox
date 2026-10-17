import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const projectFolder = path.resolve('.');
export const dependencyManifestPath = path.join(projectFolder, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
export const nativeBinaryFolder = path.join(projectFolder, 'native-build', 'frame-review', 'bin');
export const generatedMovieFixture = (name: string): string =>
  path.join(projectFolder, 'tests', 'fixtures', 'gif-extraction', 'generated', name);

export type FrameReviewDependencies = {
  ffmpeg: { path: string; runtimeDllRoot: string };
  ffprobe: { path: string };
  compiler: { runtimeDllRoot: string };
  bestsource: { root: string };
  libvlc: { dll: string; plugins: string };
  sources: { bestsource: { commit: string } };
  manifestSha256: string;
};

// The manifest is written by the PowerShell bootstrap, so it may start with a UTF-8 BOM.
export function readFrameReviewDependencies(): FrameReviewDependencies {
  return JSON.parse(readFileSync(dependencyManifestPath, 'utf8').replace(/^﻿/, '')) as FrameReviewDependencies;
}

/** Why the native frame-review stack cannot run here, or null when it can. */
export function nativeFrameReviewUnavailableReason(...requiredFiles: string[]): string | null {
  if (process.platform !== 'win32') return 'The native frame-review runtime requires Windows.';
  const missing = [dependencyManifestPath, ...requiredFiles].filter(file => !existsSync(file));
  return missing.length === 0
    ? null
    : `Native frame review needs npm run frame-review:bootstrap, frame-review:build and the generated fixtures. Missing: ${missing.join(', ')}`;
}

export function toolEnvironment(dependencies: FrameReviewDependencies): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [dependencies.ffmpeg.runtimeDllRoot, dependencies.compiler.runtimeDllRoot, process.env.PATH ?? ''].join(path.delimiter),
  };
}
