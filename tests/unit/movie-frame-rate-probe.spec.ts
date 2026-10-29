// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { MovieFrameRateProbe } = require('../../electron/movie-frame-rate-probe.cjs');

function probeAnswering(stream: Record<string, string>, stdoutPrefix = '') {
  const runCommand = vi.fn(async (_command: string, _args: string[]) => ({
    ok: true, stdout: `${stdoutPrefix}${JSON.stringify({ streams: [stream] })}`,
  }));
  return { runCommand, probe: new MovieFrameRateProbe({ resolveFfprobe: () => 'ffprobe', environment: {}, runCommand }) };
}

describe('MovieFrameRateProbe', () => {
  it('reads the average frame rate of the movie’s selected stream', async () => {
    const { probe, runCommand } = probeAnswering({ avg_frame_rate: '24000/1001', r_frame_rate: '24/1' });

    await expect(probe.framesPerSecond('D:\\movies\\Feature.mkv', 2)).resolves.toBeCloseTo(23.976, 3);
  });

  it('asks FFprobe for the frame rates of the selected stream of the movie', async () => {
    const { probe, runCommand } = probeAnswering({ avg_frame_rate: '24000/1001', r_frame_rate: '24/1' });

    await probe.framesPerSecond('D:\\movies\\Feature.mkv', 2);

    expect(runCommand.mock.calls[0][1]).toEqual([
      '-v', 'error', '-select_streams', '2',
      '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'json', 'D:\\movies\\Feature.mkv',
    ]);
  });

  it('reads FFprobe output that starts with a UTF-8 byte order mark', async () => {
    const { probe } = probeAnswering({ avg_frame_rate: '25/1', r_frame_rate: '25/1' }, String.fromCharCode(0xfeff));

    await expect(probe.framesPerSecond('D:\\movies\\Feature.mkv', 0)).resolves.toBe(25);
  });

  it('falls back to the base frame rate when the average is unknown', async () => {
    const { probe } = probeAnswering({ avg_frame_rate: '0/0', r_frame_rate: '25/1' });

    await expect(probe.framesPerSecond('D:\\movies\\Feature.mkv', 0)).resolves.toBe(25);
  });

  it('fails when FFprobe cannot read the movie', async () => {
    const probe = new MovieFrameRateProbe({ resolveFfprobe: () => 'ffprobe', environment: {}, runCommand: async () => ({ ok: false }) });

    await expect(probe.framesPerSecond('D:\\movies\\Feature.mkv', 0)).rejects.toThrow('The movie frame rate could not be read.');
  });
});
