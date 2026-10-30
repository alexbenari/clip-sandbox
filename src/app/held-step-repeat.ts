export type StepDirection = -1 | 1;

type Hold = Readonly<{ direction: StepDirection }>;

// A held key steps once at once, then again after a pause and faster from then on, until it is released,
// another key is held, or a step answers that it cannot go on. The timing matches the movie player's held steps.
export class HeldStepRepeat<TAnswer> {
  private static readonly repeatDelayMs = 250;
  private static readonly repeatIntervalMs = 38;
  private held: Hold | null = null;
  private stopWaiting: (() => void) | null = null;

  constructor(
    private readonly step: (direction: StepDirection) => Promise<TAnswer>,
    private readonly goesOn: (answer: TAnswer) => boolean,
  ) {}

  // The first step is asked for at once, so it keeps its place among the keys pressed around it.
  async press(direction: StepDirection): Promise<TAnswer> {
    const hold: Hold = Object.freeze({ direction });
    this.endHold();
    this.held = hold;
    const pressedAtMs = Date.now();
    let answer = await this.step(direction);
    let delayMs = HeldStepRepeat.repeatDelayMs - (Date.now() - pressedAtMs);
    while (this.held === hold && this.goesOn(answer)) {
      await this.wait(delayMs);
      if (this.held !== hold) break;
      answer = await this.step(direction);
      delayMs = HeldStepRepeat.repeatIntervalMs;
    }
    if (this.held === hold) this.held = null;
    return answer;
  }

  release(direction?: StepDirection): void {
    if (direction === undefined || this.held?.direction === direction) this.endHold();
  }

  private endHold(): void {
    this.held = null;
    this.stopWaiting?.();
    this.stopWaiting = null;
  }

  private wait(delayMs: number): Promise<void> {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, delayMs);
      this.stopWaiting = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}
