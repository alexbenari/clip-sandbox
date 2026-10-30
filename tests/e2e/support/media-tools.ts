import { spawn } from 'node:child_process';

import { readFrameReviewDependencies, toolEnvironment } from '../../support/frame-review-dependencies.js';

export function runTool(executable: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { env, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(stdout) : reject(new Error(stderr))));
  });
}

export async function runFfmpeg(args: readonly string[]): Promise<void> {
  const dependencies = readFrameReviewDependencies();
  await runTool(dependencies.ffmpeg.path, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], toolEnvironment(dependencies));
}

async function probe(file: string, args: readonly string[]): Promise<string> {
  const dependencies = readFrameReviewDependencies();
  return (await runTool(dependencies.ffprobe.path, ['-v', 'error', ...args, '-of', 'csv=p=0', file], toolEnvironment(dependencies))).trim();
}

export async function videoFrameCount(file: string): Promise<number> {
  return Number(await probe(file, ['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames']));
}

export async function streamKinds(file: string): Promise<string[]> {
  return (await probe(file, ['-show_entries', 'stream=codec_type'])).split(/\r?\n/).filter(Boolean);
}
