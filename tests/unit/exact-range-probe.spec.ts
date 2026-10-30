// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ExactRangeProbe } = require('../../electron/exact-range-probe.cjs');

const source = { sourcePath: 'D:\\movies\\Feature.mkv', selectedStream: 0 };
const signal = new AbortController().signal;

function probeAnswering(document: object, { byteOrderMark = false } = {}) {
  const stdout = `${byteOrderMark ? String.fromCharCode(0xfeff) : ''}${JSON.stringify(document)}`;
  const runCommand = vi.fn(async () => ({ ok: true, code: 'completed', stdout }));
  return new ExactRangeProbe({ resolveFfprobe: () => 'ffprobe', runCommand });
}

// Four frames 40 ms apart, starting at 10 s.
const frames = [10, 10.04, 10.08, 10.12].map(time => ({ best_effort_timestamp_time: String(time), pkt_duration_time: '0.04' }));

describe('ExactRangeProbe', () => {
  it('times a cut from its first frame to the frame that follows its last', async () => {
    const probe = probeAnswering({ frames });

    const boundaries = await probe.frameBoundaries(source, { startFrameIndex: 1, endFrameIndex: 2 }, signal);

    expect(boundaries).toEqual({ startUs: 10_040_000n, endUs: 10_120_000n });
  });

  it('ends a cut that reaches the source’s last frame one frame duration after it', async () => {
    const probe = probeAnswering({ frames });

    const boundaries = await probe.frameBoundaries(source, { startFrameIndex: 2, endFrameIndex: 3 }, signal);

    expect(boundaries).toEqual({ startUs: 10_080_000n, endUs: 10_160_000n });
  });

  it('refuses encoded media that holds another number of frames than expected', async () => {
    const probe = probeAnswering({ streams: [{ codec_type: 'video', nb_read_frames: '41' }] });

    await expect(probe.verifyEncoded('D:\\work\\media.mp4', 82, signal)).rejects.toThrow('The encoded media has the wrong number of frames.');
  });

  it('accepts encoded media that holds the expected number of frames, read from output that starts with a byte order mark', async () => {
    const probe = probeAnswering({ streams: [{ codec_type: 'audio' }, { codec_type: 'video', nb_read_frames: '82' }] }, { byteOrderMark: true });

    await expect(probe.verifyEncoded('D:\\work\\media.mp4', 82, signal)).resolves.toBeUndefined();
  });
});
