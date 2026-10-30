import { beforeEach, describe, expect, it } from 'vitest';

import { ButtonRowArrowKeys } from '../../src/ui/button-row-arrow-keys.js';

function press(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
  document.activeElement?.dispatchEvent(event);
  return event;
}

const focusedText = () => document.activeElement?.textContent;

describe('ButtonRowArrowKeys', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="dialog">
        <input id="name" />
        <div><button>Cancel</button><button disabled>Off</button><button hidden>Gone</button><button>Replace</button><button>Keep both</button></div>
      </div>`;
    ButtonRowArrowKeys.attachTo(document.getElementById('dialog')!);
  });

  it('moves the focus to the next and the previous button', () => {
    document.querySelectorAll<HTMLButtonElement>('button')[3].focus();

    press('ArrowRight');
    expect(focusedText()).toBe('Keep both');
    press('ArrowLeft');
    expect(focusedText()).toBe('Replace');
  });

  it('skips disabled and hidden buttons', () => {
    document.querySelector<HTMLButtonElement>('button')!.focus();

    press('ArrowRight');

    expect(focusedText()).toBe('Replace');
  });

  it('wraps from the last button to the first and back', () => {
    document.querySelectorAll<HTMLButtonElement>('button')[4].focus();

    press('ArrowRight');
    expect(focusedText()).toBe('Cancel');
    press('ArrowLeft');
    expect(focusedText()).toBe('Keep both');
  });

  it('keeps the arrow keys from reaching anything else once they moved the focus', () => {
    document.querySelector<HTMLButtonElement>('button')!.focus();

    expect(press('ArrowRight').defaultPrevented).toBe(true);
  });

  it('leaves arrow keys typed in a field to the field', () => {
    document.getElementById('name')!.focus();

    const event = press('ArrowRight');

    expect(document.activeElement?.id).toBe('name');
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves arrow keys held with a modifier alone', () => {
    document.querySelector<HTMLButtonElement>('button')!.focus();

    press('ArrowRight', { shiftKey: true });

    expect(focusedText()).toBe('Cancel');
  });
});
