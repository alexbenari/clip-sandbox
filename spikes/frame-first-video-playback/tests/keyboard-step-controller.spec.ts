import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeyboardStepController } from '../src/host/keyboard-step-controller';

describe('KeyboardStepController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues stepping in +/-1 mode while the arrow key is held', async () => {
    vi.useFakeTimers();
    const steps: number[] = [];
    const controller = new KeyboardStepController(
      () => ({
        getSelectedStepSize: () => 1 as const,
        stepFrames: async (delta: number) => {
          steps.push(delta);
        },
      }),
      75,
    );

    controller.keyDown(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(steps).toEqual([1]);

    await vi.advanceTimersByTimeAsync(225);
    expect(steps).toEqual([1, 1, 1, 1]);

    controller.keyUp(1);
    await vi.advanceTimersByTimeAsync(225);
    expect(steps).toEqual([1, 1, 1, 1]);
  });

  it('does not create duplicate repeat loops from browser key-repeat events', async () => {
    vi.useFakeTimers();
    const steps: number[] = [];
    const controller = new KeyboardStepController(
      () => ({
        getSelectedStepSize: () => 1 as const,
        stepFrames: async (delta: number) => {
          steps.push(delta);
        },
      }),
      75,
    );

    controller.keyDown(-1);
    controller.keyDown(-1);
    await vi.advanceTimersByTimeAsync(150);

    expect(steps).toEqual([-1, -1, -1]);
  });
});
