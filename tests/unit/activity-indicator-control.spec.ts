// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ActivityIndicatorControl } from '../../src/ui/activity-indicator-control.js';

afterEach(() => {
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

function createControl() {
  document.body.innerHTML = `
    <div id="root">
      <button id="button" aria-expanded="false" aria-controls="panel"></button>
      <section id="panel" hidden>
        <ul id="list"></ul>
      </section>
    </div>
  `;

  return new ActivityIndicatorControl({
    root: document.getElementById('root'),
    button: document.getElementById('button'),
    panel: document.getElementById('panel'),
    listEl: document.getElementById('list'),
    document,
    win: window,
  });
}

describe('activity indicator control', () => {
  test('keeps a newest-first history and returns to idle after success', async () => {
    vi.useFakeTimers();
    const control = createControl();

    control.show('Loaded pipeline.', 25);
    control.show('Saved collection.', 25);

    expect(document.getElementById('button').dataset.state).toBe('success');
    expect(Array.from(document.querySelectorAll('#list li')).map((el) => el.textContent)).toEqual([
      'Saved collection.',
      'Loaded pipeline.',
    ]);

    await vi.advanceTimersByTimeAsync(25);
    expect(document.getElementById('button').dataset.state).toBe('idle');
  });

  test('auto-opens on error and keeps the red state after dismissing the panel', () => {
    const control = createControl();

    control.showError('Loopify failed.');
    expect(document.getElementById('panel').hidden).toBe(false);
    expect(document.getElementById('button').dataset.state).toBe('error');

    document.getElementById('button').click();
    expect(document.getElementById('panel').hidden).toBe(true);
    expect(document.getElementById('button').dataset.state).toBe('error');
  });

  test('shows progress without auto-opening the panel', () => {
    const control = createControl();

    control.showProgress('Loopify started.');

    expect(document.getElementById('button').dataset.state).toBe('progress');
    expect(document.getElementById('panel').hidden).toBe(true);
    expect(document.querySelector('#list li').textContent).toBe('Loopify started.');
  });
});

