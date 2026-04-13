import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCollectionConflictController } from '../../../src/ui/collection-conflict-controller.js';

describe('collection conflict controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('shows conflict details and dispatches apply/cancel handlers', () => {
    document.body.innerHTML = `
      <section id="root" hidden>
        <p id="summary"></p>
        <pre id="list"></pre>
        <button id="applyBtn">Apply</button>
        <button id="cancelBtn">Cancel</button>
      </section>
    `;

    const onApply = vi.fn();
    const onCancel = vi.fn();
    const controller = createCollectionConflictController({
      root: document.getElementById('root'),
      summaryEl: document.getElementById('summary'),
      listEl: document.getElementById('list'),
      applyBtn: document.getElementById('applyBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
    });

    controller.show({
      summary: '1 missing entry',
      list: 'missing.mp4',
      onApply,
      onCancel,
    });
    expect(controller.isVisible()).toBe(true);
    expect(document.getElementById('summary').textContent).toBe('1 missing entry');
    expect(document.getElementById('list').textContent).toBe('missing.mp4');

    document.getElementById('applyBtn').click();
    expect(onApply).toHaveBeenCalledOnce();
    expect(controller.isVisible()).toBe(false);

    controller.show({
      summary: '1 missing entry',
      list: 'missing.mp4',
      onApply,
      onCancel,
    });
    document.getElementById('cancelBtn').click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(controller.isVisible()).toBe(false);
  });
});
