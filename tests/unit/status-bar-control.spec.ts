// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarControl } from '../../src/ui/status-bar-control.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('status bar control', () => {
  it('shows status text and hides it after the timeout', async () => {
    vi.useFakeTimers();
    const statusEl = document.createElement('div');
    statusEl.hidden = true;
    const control = new StatusBarControl({ statusEl, win: window });

    control.show('Saved', 20);
    expect(statusEl.textContent).toBe('Saved');
    expect(statusEl.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    expect(statusEl.hidden).toBe(true);
  });
});
