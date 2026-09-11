import { afterEach, describe, expect, it } from 'vitest';
import { COLLECTION_SHORTCUTS } from '../../src/app/app-keydown-handler.js';
import { FULLSCREEN_SHORTCUTS } from '../../src/app/fullscreen-session.js';
import type { ShortcutDescriptor } from '../../src/ui/app-screen.js';
import { KeyboardMapControl } from '../../src/ui/keyboard-map-control.js';

afterEach(() => document.body.replaceChildren());

function createControl(
  globalShortcuts: readonly ShortcutDescriptor[] = [
    { description: 'Close the open app-bar utility', sequences: [['Escape']] },
  ],
) {
  const root = document.createElement('section');
  root.id = 'keyboardMapPanel';
  document.body.append(root);
  return { root, control: new KeyboardMapControl(root, globalShortcuts) };
}

describe('KeyboardMapControl', () => {
  it('renders an empty screen section and a separate Global section', () => {
    const { root, control } = createControl();
    control.render({ label: 'Settings', shortcuts: [] });

    expect(root.querySelector('h2')?.textContent).toBe('Keyboard shortcuts');
    expect(root.querySelector('.keyboard-context')?.textContent).toBe('Settings Shortcuts below reflect the active screen.');
    expect(root.querySelector('.keyboard-context span')?.textContent).toBe('Shortcuts below reflect the active screen.');
    expect(root.textContent).toContain('No screen-specific shortcuts.');
    expect(Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent)).toEqual(['Settings', 'Global']);
    expect(Array.from(root.querySelectorAll('.keyboard-keys kbd')).map((key) => key.textContent)).toEqual(['Escape']);
  });

  it('renders explicit groups, alternative sequences, and chords without inferring context from descriptions', () => {
    const { root, control } = createControl([]);
    control.render({
      label: 'Collection',
      shortcuts: [
        { description: 'Open selected clip in Zoom', group: 'Grid', sequences: [['Z']] },
        { description: 'Remove selection', group: 'Grid', sequences: [['Delete'], ['Backspace']] },
        { description: 'Use either chord', group: 'Zoom', sequences: [['Ctrl', 'Enter'], ['Shift', 'F12']] },
        { description: 'Zoom appears only in this description', sequences: [['Q']] },
      ],
    });

    expect(Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent)).toEqual(['Grid', 'Zoom', 'Global']);
    expect(Array.from(root.querySelectorAll('.keyboard-keys')).map((keys) => keys.textContent)).toEqual([
      'Z',
      'Delete or Backspace',
      'Ctrl+Enter or Shift+F12',
      'Q',
    ]);
  });

  it('renders the Collection shortcuts under Grid, Zoom, and Fullscreen contexts', () => {
    const { root, control } = createControl();
    control.render({ label: 'Collection', shortcuts: [...COLLECTION_SHORTCUTS, ...FULLSCREEN_SHORTCUTS] });

    expect(Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent)).toEqual([
      'Grid',
      'Zoom',
      'Fullscreen',
      'Global',
    ]);
    expect(Array.from(root.querySelectorAll('dt')).map((description) => description.textContent)).toEqual([
      'Open selected clip in Zoom',
      'Remove selection',
      'Toggle audio',
      'Previous clip',
      'Next clip',
      'Close Zoom',
      'Toggle fullscreen review',
      'Set visible clip count',
      'Close the open app-bar utility',
    ]);
    expect(Array.from(root.querySelectorAll('.keyboard-keys')).map((keys) => keys.textContent)).toEqual([
      'Z',
      'Delete or Backspace',
      'A',
      'Left',
      'Right',
      'Escape',
      'F',
      '0-9',
      'Escape',
    ]);
  });

  it('renders long labels with only the labeled close button as an interactive control', () => {
    const { root, control } = createControl([]);
    control.render({
      label: 'A screen with a deliberately long contextual label',
      shortcuts: [{ description: 'A deliberately long shortcut description for layout coverage', sequences: [['Shift', 'Alt', 'F12']] }],
    });

    expect(root.querySelector('.keyboard-shortcuts')?.textContent).toContain('Shift+Alt+F12');
    expect(root.querySelectorAll('input, textarea, select, [contenteditable]').length).toBe(0);
    expect(Array.from(root.querySelectorAll('button')).map((button) => ({
      label: button.getAttribute('aria-label'),
      title: button.title,
      type: button.type,
    }))).toEqual([{
      label: 'Close Keyboard shortcuts',
      title: 'Close Keyboard shortcuts',
      type: 'button',
    }]);
    expect(root.querySelector('button svg.shell-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(root.querySelectorAll('kbd')).every((key) => !key.hasAttribute('tabindex'))).toBe(true);
  });

  it('replaces the active screen context and keeps hostile labels literal', () => {
    const { root, control } = createControl([]);
    control.render({ label: '<img src=x onerror=alert(1)>', shortcuts: [] });
    control.render({ label: 'Collection', shortcuts: [{ description: 'Browse', sequences: [['B']] }] });

    expect(root.querySelector('.keyboard-context')?.textContent).toBe('Collection Shortcuts below reflect the active screen.');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).not.toContain('<img');
  });

  it('keeps the heading as the initial focus target', () => {
    const { root, control } = createControl();
    control.render({ label: 'Collection', shortcuts: [] });
    control.focusInitial();

    expect(document.activeElement).toBe(root.querySelector('#keyboardMapHeading'));
    expect(root.querySelector('#keyboardMapHeading')?.getAttribute('tabindex')).toBe('-1');
  });
});
