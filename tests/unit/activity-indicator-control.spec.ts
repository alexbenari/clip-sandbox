// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ActivityIndicatorControl } from '../../src/ui/activity-indicator-control.js';

const controls: ActivityIndicatorControl[] = [];
afterEach(() => {
  for (const control of controls.splice(0)) control.destroy();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

function createControl(options = {}) {
  document.body.innerHTML = `
    <div id="root">
      <button id="button" aria-expanded="false" aria-controls="panel"></button>
      <section id="panel" hidden>
        <ul id="list"></ul>
      </section>
    </div>
  `;

  const control = new ActivityIndicatorControl({
    root: document.getElementById('root'),
    button: document.getElementById('button'),
    panel: document.getElementById('panel'),
    listEl: document.getElementById('list'),
    document,
    win: window,
    ...options,
  });
  controls.push(control);
  return control;
}

function expectActivityStatus(state: string, visibleText: string, semanticName: string) {
  const activityButton = document.getElementById('button');
  expect(activityButton.dataset.state).toBe(state);
  expect(activityButton.querySelector('.activity-status-dot')?.getAttribute('aria-hidden')).toBe('true');
  expect(activityButton.querySelector('.activity-status-label')?.textContent).toBe(visibleText);
  expect(activityButton.getAttribute('aria-label')).toBe(semanticName);
  expect(activityButton.getAttribute('title')).toBe(semanticName);
}

describe('activity indicator control', () => {
  test('keeps a newest-first history and returns to idle after success', async () => {
    vi.useFakeTimers();
    const control = createControl();
    expectActivityStatus('idle', 'Ready', 'Activity and Errors: Ready');

    control.show('Loaded pipeline.', 25);
    control.show('Saved collection.', 25);

    expectActivityStatus('success', 'Ready', 'Activity and Errors: Ready');
    expect(Array.from(document.querySelectorAll('#list li')).map((el) => el.textContent)).toEqual([
      'Saved collection.',
      'Loaded pipeline.',
    ]);

    await vi.advanceTimersByTimeAsync(25);
    expectActivityStatus('idle', 'Ready', 'Activity and Errors: Ready');
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

    expectActivityStatus('progress', 'Working…', 'Activity and Errors: Working');
    expect(document.getElementById('panel').hidden).toBe(true);
    expect(document.querySelector('#list li').textContent).toBe('Loopify started.');
  });
});


function rows() { return Array.from(document.querySelectorAll<HTMLLIElement>('#list > li')); }
function button(label: string, root: Element = document.body): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
function press(key: string, target: Element = document.activeElement!) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('detailed Activity and Errors', () => {
  test('retains newest 50 ordinary entries plus all unresolved errors; resolution applies the limit', () => {
    const control = createControl();
    const error = control.showError('Keep me');
    for (let i = 0; i < 55; i++) control.showInformation(`Entry ${i}`);
    expect(rows()).toHaveLength(51);
    expect(rows()[0].textContent).toBe('Entry 54');
    expect(rows()[49].textContent).toBe('Entry 5');
    expect(rows()[50].textContent).toContain('Keep me');
    control.resolveError(error);
    expect(rows()).toHaveLength(50);
    expect(rows().some(row => row.textContent.includes('Keep me'))).toBe(false);
  });

  test('bulk clear retains unresolved errors; explicit clear keeps focus in history and clears the dot', () => {
    const control = createControl();
    control.showError('Unresolved');
    control.showInformation('Clear me');
    const resolved = control.showError('Resolved');
    control.resolveError(resolved);
    button('Clear history').click();
    expect(rows()).toHaveLength(1);
    expectActivityStatus('error', '1 error', 'Activity and Errors: 1 unresolved error');
    expect(document.querySelector('.activity-indicator-clear-feedback').textContent).toContain('1 unresolved error retained');
    button('Clear error').focus();
    button('Clear error').click();
    expect(rows()).toHaveLength(0);
    expect(document.activeElement).toBe(document.querySelector('[role=region]'));
    expectActivityStatus('idle', 'Ready', 'Activity and Errors: Ready');
  });

  test('counts every unresolved error and updates immediately when errors resolve', () => {
    const control = createControl();
    const firstError = control.showError('First failure');
    const secondError = control.showError('Second failure');
    expectActivityStatus('error', '2 errors', 'Activity and Errors: 2 unresolved errors');

    control.showProgress('Background retry started');
    expectActivityStatus('error', '2 errors', 'Activity and Errors: 2 unresolved errors');

    control.resolveError(firstError);
    expectActivityStatus('error', '1 error', 'Activity and Errors: 1 unresolved error');

    control.resolveError(secondError);
    expectActivityStatus('progress', 'Working…', 'Activity and Errors: Working');

    control.showSuccess('Background retry finished');
    expectActivityStatus('success', 'Ready', 'Activity and Errors: Ready');
  });

  test('does not keep showing Working after a failed operation is dismissed', () => {
    const control = createControl();
    control.showProgress('Saving settings');
    control.showError('Settings were not saved');
    button('Clear error').click();
    expectActivityStatus('idle', 'Ready', 'Activity and Errors: Ready');
  });

  test('preserves focused controls and open technical details as new messages arrive', () => {
    const control = createControl();
    control.showError('<broken>', { affected: '<clip>', recovery: 'Try again', technicalDetails: '<script>bad</script>' });
    const row = rows()[0];
    const details = row.querySelector('details');
    details.open = true;
    const copy = button('Copy details');
    copy.focus();
    control.showInformation('Background event');
    expect(rows()[1]).toBe(row);
    expect(document.activeElement).toBe(copy);
    expect(details.open).toBe(true);
    expect(row.querySelector('script')).toBeNull();
    expect(row.querySelector('pre').textContent).toBe('<script>bad</script>');
  });

  test('copy success and failure stay local without replacing the entry or adding errors', async () => {
    const writeClipboard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Denied'));
    const control = createControl({ writeClipboard });
    control.showError('Broken', { technicalDetails: 'diagnostic' });
    const row = rows()[0];
    button('Copy details').click();
    await vi.waitFor(() => expect(row.textContent).toContain('Technical details copied.'));
    expect(writeClipboard).toHaveBeenCalledWith('diagnostic');
    button('Copy details').click();
    await vi.waitFor(() => expect(row.querySelector('[role=status]').textContent).toContain('Copy failed: Denied'));
    expect(rows()).toEqual([row]);
  });

  test('a pending retry runs once, survives bulk clear, reports typed failure and then resolves', async () => {
    let finish;
    const retry = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ok: true });
    const control = createControl();
    control.showError('Save failed', { retry });
    button('Retry').focus();
    button('Retry').click();
    button('Retrying…').click();
    expect(retry).toHaveBeenCalledOnce();
    expect(button('Clear error').disabled).toBe(true);
    button('Clear history').click();
    expect(rows()).toHaveLength(1);
    finish({ ok: false, error: 'Still full' });
    await vi.waitFor(() => expect(rows()[0].textContent).toContain('Retry failed: Still full'));
    expectActivityStatus('error', '1 error', 'Activity and Errors: 1 unresolved error');
    button('Retry').click();
    await vi.waitFor(() => expect(rows()[0].dataset.resolution).toBe('resolved'));
    expectActivityStatus('idle', 'Ready', 'Activity and Errors: Ready');
    expect(rows()[0].textContent).not.toContain('Retry failed');
    expect(document.body.contains(document.activeElement)).toBe(true);
    button('Clear history').click();
    expect(rows()).toHaveLength(0);
  });

  test('unexpected retry rejection stays unresolved and can be tried again', async () => {
    const control = createControl();
    control.showError('Failed', { retry: async () => { throw new Error('Disconnected'); } });
    button('Retry').click();
    await vi.waitFor(() => expect(rows()[0].textContent).toContain('Retry failed: Disconnected'));
    expect(rows()[0].dataset.resolution).toBe('unresolved');
    expect(button('Retry').disabled).toBe(false);
  });

  test('all navigation keys move focus using row geometry and reveal the focused entry', () => {
    const control = createControl();
    for (let i = 0; i < 7; i++) control.showInformation(`Entry ${i}`);
    const region = document.querySelector('[role=region]');
    Object.defineProperty(region, 'clientHeight', { value: 200 });
    const tops = [0, 60, 140, 280, 350, 480, 560];
    rows().forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: tops[i] });
      row.scrollIntoView = vi.fn();
    });
    control.focusInitial();
    press('ArrowDown'); expect(document.activeElement).toBe(rows()[0]);
    press('ArrowDown'); expect(document.activeElement).toBe(rows()[1]);
    press('ArrowUp'); expect(document.activeElement).toBe(rows()[0]);
    press('PageDown'); expect(document.activeElement).toBe(rows()[3]);
    press('PageUp'); expect(document.activeElement).toBe(rows()[1]);
    press('End'); expect(document.activeElement).toBe(rows()[6]);
    press('Home'); expect(document.activeElement).toBe(rows()[0]);
    expect(rows()[0].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  test('interactive children keep navigation keys and external auto-open policy owns focus', () => {
    const requestPanelOpen = vi.fn();
    const control = createControl({ requestPanelOpen });
    const protectedControl = document.createElement('input');
    document.body.append(protectedControl);
    protectedControl.focus();
    control.showError('Failed', { technicalDetails: 'details' });
    expect(requestPanelOpen).toHaveBeenCalledOnce();
    expect(document.getElementById('panel').hidden).toBe(true);
    expect(document.activeElement).toBe(protectedControl);
    expectActivityStatus('error', '1 error', 'Activity and Errors: 1 unresolved error');
    document.getElementById('panel').hidden = false;
    for (const child of [document.querySelector('summary'), button('Clear error')]) {
      child.focus();
      for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
        expect(press(key).defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(child);
      }
    }
  });

  test('success returns to unresolved error state even after an informational entry', async () => {
    vi.useFakeTimers();
    const control = createControl();
    control.showError('Still unresolved');
    control.showSuccess('Other success', 20);
    control.showInformation('FYI');
    await vi.advanceTimersByTimeAsync(20);
    expect(document.getElementById('button').dataset.state).toBe('error');
  });

  test('destroy prevents late retry completion from changing the surface', async () => {
    let finish;
    const control = createControl();
    control.showError('Failed', { retry: () => new Promise(resolve => { finish = resolve; }) });
    button('Retry').click();
    control.destroy();
    finish({ ok: true });
    await Promise.resolve();
    expect(rows()[0].dataset.resolution).toBe('unresolved');
  });
});
