export type StepDirection = -1 | 1;

export interface KeyboardStepTarget {
  getSelectedStepSize(): 1 | 10;
  stepFrames(delta: number): Promise<unknown>;
}

export class KeyboardStepController {
  private heldDirection: StepDirection | null = null;

  private generation = 0;

  private repeatTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getTarget: () => KeyboardStepTarget,
    private readonly repeatDelayMs = 75,
  ) {}

  keyDown(direction: StepDirection): void {
    if (this.heldDirection === direction) {
      return;
    }

    this.stop();
    this.heldDirection = direction;
    const generation = this.generation;
    void this.runStep(generation, direction);
  }

  keyUp(direction: StepDirection): void {
    if (this.heldDirection === direction) {
      this.stop();
    }
  }

  stop(): void {
    this.heldDirection = null;
    this.generation += 1;
    if (this.repeatTimer !== null) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private async runStep(generation: number, direction: StepDirection): Promise<void> {
    const target = this.getTarget();
    await target.stepFrames(direction * target.getSelectedStepSize());

    if (generation !== this.generation || this.heldDirection !== direction) {
      return;
    }

    this.repeatTimer = setTimeout(() => {
      this.repeatTimer = null;
      void this.runStep(generation, direction);
    }, this.repeatDelayMs);
  }
}
