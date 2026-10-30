const { runProcess } = require('./process-runner.cjs');

// FFprobe reads for the exact-range encoder: the cut's boundary times when no index can give them, and a check
// of the encoded media.
class ExactRangeProbe {
  #resolveFfprobe;
  #runCommand;
  #environment;

  constructor({ resolveFfprobe, runCommand = runProcess, environment = process.env }) {
    if (typeof resolveFfprobe !== 'function') throw new Error('Exact-range probe dependencies are invalid.');
    this.#resolveFfprobe = resolveFfprobe;
    this.#runCommand = runCommand;
    this.#environment = environment;
  }

  async frameBoundaries({ sourcePath, selectedStream }, { startFrameIndex, endFrameIndex }, signal) {
    const document = await this.#probed([
      '-v', 'error',
      '-select_streams', String(selectedStream),
      '-show_frames',
      '-show_entries', 'frame=best_effort_timestamp_time,pkt_duration_time',
      '-of', 'json',
      sourcePath,
    ], signal, 'Could not inspect original-source frame times.');
    const frames = Array.isArray(document.frames) ? document.frames : [];
    const start = frames[startFrameIndex];
    const end = frames[endFrameIndex];
    const following = frames[endFrameIndex + 1];
    const secondsToUs = value => BigInt(Math.round(Number(value) * 1_000_000));
    if (!start || !end || !Number.isFinite(Number(start.best_effort_timestamp_time))
      || !Number.isFinite(Number(end.best_effort_timestamp_time))) {
      throw new Error('Original-source frame boundaries are unavailable.');
    }
    const startUs = secondsToUs(start.best_effort_timestamp_time);
    const endUs = following && Number.isFinite(Number(following.best_effort_timestamp_time))
      ? secondsToUs(following.best_effort_timestamp_time)
      : secondsToUs(end.best_effort_timestamp_time) + secondsToUs(end.pkt_duration_time || 0.04);
    if (endUs <= startUs) throw new Error('Original-source frame boundaries are invalid.');
    return { startUs, endUs };
  }

  async verifyEncoded(mediaPath, expectedFrames, signal) {
    const document = await this.#probed([
      '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames',
      '-of', 'json', mediaPath,
    ], signal, 'Could not verify the encoded media.');
    const video = Array.isArray(document.streams) && document.streams.find(stream => stream.codec_type === 'video');
    if (!video) throw new Error('The encoded media has no video stream.');
    if (Number(video.nb_read_frames) !== expectedFrames) throw new Error('The encoded media has the wrong number of frames.');
  }

  async #probed(args, signal, failureMessage) {
    const result = await this.#runCommand(this.#resolveFfprobe(), args, { signal, env: this.#environment });
    if (!result.ok) throw Object.assign(new Error(failureMessage), { code: result.code });
    return JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
  }
}

module.exports = { ExactRangeProbe };
