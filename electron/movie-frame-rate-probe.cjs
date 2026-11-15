const { ProcessRunner } = require('./process-runner.cjs');

class MovieFrameRateProbe {
  #resolveFfprobe;
  #environment;
  #processRunner;

  constructor({ resolveFfprobe, environment, processRunner = new ProcessRunner() }) {
    this.#resolveFfprobe = resolveFfprobe;
    this.#environment = environment;
    this.#processRunner = processRunner;
  }

  async framesPerSecond(moviePath, selectedStream) {
    const result = await this.#processRunner.run(this.#resolveFfprobe(), [
      '-v', 'error', '-select_streams', String(selectedStream),
      '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'json', moviePath,
    ], { env: this.#environment });
    if (!result.ok) throw new Error('The movie frame rate could not be read.');
    const stream = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, '')).streams?.[0];
    return this.#rate(stream?.avg_frame_rate) ?? this.#rate(stream?.r_frame_rate);
  }

  #rate(fraction) {
    const match = /^(\d+)\/(\d+)$/.exec(String(fraction ?? ''));
    if (!match || Number(match[1]) === 0 || Number(match[2]) === 0) return null;
    return Number(match[1]) / Number(match[2]);
  }
}

module.exports = { MovieFrameRateProbe };
