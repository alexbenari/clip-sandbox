export class PreparationProgressTracker {
  #emit;
  #now;
  #phase = null;
  #startedAt = 0;
  #percent = 0;

  constructor(emit, now = Date.now) {
    this.#emit = emit;
    this.#now = now;
  }

  begin(phase) {
    if (!phase) throw new Error('Preparation phase is required.');
    this.#phase = phase;
    this.#startedAt = this.#now();
    this.#percent = 0;
    this.#publish(0, null);
  }

  update(current, total) {
    if (!this.#phase) throw new Error('Preparation progress has no active phase.');
    if (!Number.isFinite(current) || !Number.isFinite(total) || current < 0 || total <= 0) return;
    const percent = Math.max(this.#percent, Math.min(100, Math.floor(current * 100 / total)));
    this.#percent = percent;
    const elapsedMs = Math.max(0, this.#now() - this.#startedAt);
    const etaMs = current > 0 && current < total
      ? Math.round(elapsedMs * (total - current) / current)
      : current >= total ? 0 : null;
    this.#publish(percent, etaMs);
  }

  complete() {
    if (!this.#phase) throw new Error('Preparation progress has no active phase.');
    this.#percent = 100;
    this.#publish(100, 0);
    this.#phase = null;
  }

  #publish(percent, etaMs) {
    this.#emit({
      type: 'preparation-progress',
      phase: this.#phase,
      percent,
      elapsedMs: Math.max(0, this.#now() - this.#startedAt),
      etaMs,
    });
  }
}
