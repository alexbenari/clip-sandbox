// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { AudioFeedbackAdapter } from '../../src/adapters/browser/audio-feedback-adapter.js';

describe('audio feedback adapter', () => {
  it('returns false when Web Audio is unavailable', () => {
    const adapter = new AudioFeedbackAdapter({ win: {} });
    expect(adapter.playBoundaryClank()).toBe(false);
  });

  it('creates and plays a short clank using the instance audio context', () => {
    const createOscillator = () => ({
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine',
    });
    const createGain = () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    });

    const context = {
      currentTime: 1,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(createOscillator),
      createGain: vi.fn(createGain),
      resume: vi.fn(() => Promise.resolve()),
    };
    const AudioContext = vi.fn(() => context);
    const win = { AudioContext };
    const adapter = new AudioFeedbackAdapter({ win });

    expect(adapter.playBoundaryClank()).toBe(true);
    expect(adapter.playBoundaryClank()).toBe(true);
    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(context.createGain).toHaveBeenCalledTimes(2);
    expect(context.createOscillator).toHaveBeenCalledTimes(4);
  });
});

