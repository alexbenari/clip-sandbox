export type AdjacentDirection = -1 | 1;

export interface IAdjacentStepTarget<TFrame> {
  stepAdjacent(direction: AdjacentDirection): Promise<TFrame>;
}

export interface IAdjacentStepSchedulerOptions {
  readonly holdRepeatDelayMs?: number;
  readonly repeatIntervalMs?: number;
}

export const HELD_STEP_TIMING = Object.freeze({ holdRepeatDelayMs: 250, repeatIntervalMs: 38 });

export class AdjacentStepScheduler<TFrame> {
  private heldDirection: AdjacentDirection | null = null;
  private unsteppedPress: AdjacentDirection | null = null;
  private wakeFromRepeatDelay: (() => void) | null = null;
  private heldSinceMs = 0;
  private completedStepsInHold = 0;
  private running = false;
  private sourceGeneration = 0;
  private requestRevision = 0;
  private readonly idleWaiters: Array<() => void> = [];

  constructor(
    private readonly target: IAdjacentStepTarget<TFrame>,
    private readonly onFrame: (frame: TFrame) => void,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly options: IAdjacentStepSchedulerOptions = {},
  ) {
    AdjacentStepScheduler.validateDelay(options.holdRepeatDelayMs, 'holdRepeatDelayMs');
    AdjacentStepScheduler.validateDelay(options.repeatIntervalMs, 'repeatIntervalMs');
  }

  setSourceGeneration(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error('Source generation must be a non-negative safe integer.');
    }
    this.sourceGeneration = generation;
    this.requestRevision += 1;
    this.heldDirection = null;
    this.unsteppedPress = null;
    this.completedStepsInHold = 0;
  }

  press(direction: AdjacentDirection): void {
    if (direction !== -1 && direction !== 1) throw new Error('Adjacent direction must be -1 or 1.');
    if (this.heldDirection !== direction) {
      this.requestRevision += 1;
      this.heldSinceMs = Date.now();
      this.completedStepsInHold = 0;
      this.unsteppedPress = direction;
      this.wakeFromRepeatDelay?.();
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
    if (this.running || this.nextDirection() === null) return;
    this.running = true;
    void this.run();
  }

  // A press steps once even when it is released before the loop reaches it.
  private nextDirection(): AdjacentDirection | null {
    return this.heldDirection ?? this.unsteppedPress;
  }

  private async run(): Promise<void> {
    try {
      for (let direction = this.nextDirection(); direction !== null; direction = this.nextDirection()) {
        this.unsteppedPress = null;
        const generation = this.sourceGeneration;
        const revision = this.requestRevision;
        const frame = await this.target.stepAdjacent(direction);
        if (this.sourceGeneration === generation && this.requestRevision === revision) {
          this.onFrame(frame);
          this.completedStepsInHold += 1;
          const delayMs = this.completedStepsInHold === 1
            ? (this.options.holdRepeatDelayMs ?? HELD_STEP_TIMING.holdRepeatDelayMs) - (Date.now() - this.heldSinceMs)
            : this.options.repeatIntervalMs ?? HELD_STEP_TIMING.repeatIntervalMs;
          if (this.heldDirection !== null && delayMs > 0) await this.waitToRepeat(delayMs);
        }
      }
    } catch (error) {
      this.heldDirection = null;
      this.unsteppedPress = null;
      this.onError(error);
    } finally {
      this.running = false;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
      this.startIfNeeded();
    }
  }

  private async waitToRepeat(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      this.wakeFromRepeatDelay = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.wakeFromRepeatDelay = null;
  }

  private static validateDelay(value: number | undefined, label: string): void {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 10_000)) {
      throw new Error(`${label} must be an integer between 0 and 10000.`);
    }
  }
}
