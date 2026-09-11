export type AdjacentDirection = -1 | 1;

export interface IAdjacentStepTarget<TFrame> {
  stepAdjacent(direction: AdjacentDirection): Promise<TFrame>;
}

export interface IAdjacentStepSchedulerOptions {
  readonly holdRepeatDelayMs?: number;
  readonly repeatIntervalMs?: number;
}

export class AdjacentStepScheduler<TFrame> {
  private heldDirection: AdjacentDirection | null = null;
  private heldSinceMs = 0;
  private completedStepsInHold = 0;
  private running = false;
  private sourceGeneration = 0;
  private requestRevision = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly target: IAdjacentStepTarget<TFrame>,
    private readonly onFrame: (frame: TFrame) => void,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly options: IAdjacentStepSchedulerOptions = {},
  ) {
    validateDelay(options.holdRepeatDelayMs, 'holdRepeatDelayMs');
    validateDelay(options.repeatIntervalMs, 'repeatIntervalMs');
  }

  setSourceGeneration(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error('Source generation must be a non-negative safe integer.');
    }
    this.sourceGeneration = generation;
    ++this.requestRevision;
    this.heldDirection = null;
    this.completedStepsInHold = 0;
  }

  press(direction: AdjacentDirection): void {
    if (this.heldDirection !== direction) {
      ++this.requestRevision;
      this.heldSinceMs = Date.now();
      this.completedStepsInHold = 0;
    }
    this.heldDirection = direction;
    this.startIfNeeded();
  }

  release(direction?: AdjacentDirection): void {
    if (direction === undefined || this.heldDirection === direction) this.heldDirection = null;
  }

  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private startIfNeeded(): void {
    if (this.running || this.heldDirection === null) return;
    this.running = true;
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      while (this.heldDirection !== null) {
        const direction = this.heldDirection;
        const generation = this.sourceGeneration;
        const revision = this.requestRevision;
        const frame = await this.target.stepAdjacent(direction);
        if (this.sourceGeneration === generation && this.requestRevision === revision) {
          this.onFrame(frame);
          ++this.completedStepsInHold;
          const remainingDelay = this.completedStepsInHold === 1
            ? (this.options.holdRepeatDelayMs ?? 250) - (Date.now() - this.heldSinceMs)
            : this.options.repeatIntervalMs ?? 150;
          if (this.heldDirection !== null && remainingDelay > 0) await delay(remainingDelay);
        }
      }
    } catch (error) {
      this.heldDirection = null;
      this.onError(error);
    } finally {
      this.running = false;
      const waiters = this.idleWaiters.splice(0);
      for (const resolve of waiters) resolve();
      this.startIfNeeded();
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateDelay(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 10_000)) {
    throw new Error(`${label} must be an integer between 0 and 10000.`);
  }
}
