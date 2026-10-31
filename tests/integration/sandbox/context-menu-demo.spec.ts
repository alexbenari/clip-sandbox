import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageBodyOf } from '../../support/page-markup.js';

async function loadDemo(): Promise<void> {
  document.body.innerHTML = pageBodyOf('sandbox/context-menu-demo.html');
  vi.resetModules();
  await import('../../../sandbox/context-menu-demo.js');
}

function menuEntry(label: string): HTMLButtonElement {
  const menu = document.getElementById('sandboxContextMenu');
  if (!menu || menu.hidden) throw new Error('The context menu is not shown.');
  const entry = [...menu.querySelectorAll<HTMLButtonElement>('#sandboxContextMenuPanel button')]
    .find(button => button.textContent === label);
  if (!entry) throw new Error(`The open menu has no "${label}" entry.`);
  return entry;
}

describe('context menu sandbox demo', () => {
  beforeEach(loadDemo);

  it('runs the entry chosen from the menu opened by its button', () => {
    document.getElementById('openBtn')!.click();

    menuEntry('Destructive action').click();

    expect(document.getElementById('resultLog')!.textContent).toBe('Destructive action invoked from button.');
  });
});
