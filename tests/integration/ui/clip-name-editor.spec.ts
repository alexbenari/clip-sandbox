import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClipNameEditor } from '../../../src/ui/clip-name-editor.js';

function editing(filename = 'alpha.mp4') {
  const card = document.createElement('div');
  card.draggable = true;
  const cardClicks = vi.fn();
  card.addEventListener('dblclick', cardClicks);
  document.body.append(card, document.createElement('button'));
  const handlers = { submit: vi.fn(), cancel: vi.fn() };
  const editor = new ClipNameEditor(card, filename, handlers);
  const field = card.querySelector('input')!;
  const type = (value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    return event;
  };
  const leave = () => document.querySelector<HTMLButtonElement>('body > button')!.focus();
  const problem = () => {
    const element = card.querySelector<HTMLElement>('[role="alert"]')!;
    return element.hidden ? null : element.textContent;
  };
  return { editor, card, field, handlers, type, press, leave, problem, cardClicks };
}

describe('ClipNameEditor', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows the name without its extension, focused and selected', () => {
    const { field } = editing('sunset.final.mp4');

    expect(field.value).toBe('sunset.final');
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'sunset.final'.length]);
  });

  it('submits the typed name with the extension on Enter, keeping the key from anything else', () => {
    const { handlers, type, press } = editing();

    type('  sunset ');
    const event = press('Enter');

    expect(handlers.submit.mock.calls).toEqual([['sunset.mp4']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('submits a changed name when the focus leaves it', () => {
    const { handlers, type, leave } = editing();

    type('sunset');
    leave();

    expect(handlers.submit.mock.calls).toEqual([['sunset.mp4']]);
  });

  it.each([
    ['Escape', (context: ReturnType<typeof editing>) => { context.type('sunset'); context.press('Escape'); }],
    ['Enter on an unchanged name', (context: ReturnType<typeof editing>) => { context.press('Enter'); }],
    ['leaving an unchanged name', (context: ReturnType<typeof editing>) => { context.leave(); }],
  ])('cancels on %s', (_case, act) => {
    const context = editing();

    act(context);

    expect(context.handlers.cancel).toHaveBeenCalledOnce();
    expect(context.handlers.submit).not.toHaveBeenCalled();
  });

  it('submits once while the name it submitted is being checked', () => {
    const { handlers, type, press, leave } = editing();

    type('sunset');
    press('Enter');
    press('Enter');
    leave();

    expect(handlers.submit).toHaveBeenCalledOnce();
  });

  it('says why a name was refused, lets it be changed and submitted again', () => {
    const { editor, field, handlers, type, press, problem } = editing();
    type('bravo');
    press('Enter');

    editor.showProblem('name-taken');
    expect(problem()).toBe('Another file in this folder already has this name.');
    expect(document.activeElement).toBe(field);
    type('charlie');
    expect(problem()).toBeNull();
    press('Enter');

    expect(handlers.submit.mock.calls).toEqual([['bravo.mp4'], ['charlie.mp4']]);
  });

  it('gives up a refused name when the focus leaves it unchanged', () => {
    const { editor, handlers, type, press, leave } = editing();
    type('bravo');
    press('Enter');
    editor.showProblem('name-taken');

    leave();

    expect(handlers.cancel).toHaveBeenCalledOnce();
    expect(handlers.submit).toHaveBeenCalledOnce();
  });

  it('keeps a double-click in the field from reaching the card', () => {
    const { field, cardClicks } = editing();

    field.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(cardClicks).not.toHaveBeenCalled();
  });

  it('removes the field and gives the focus back to the card', () => {
    const { editor, card } = editing();
    card.tabIndex = -1;

    editor.remove();

    expect(card.querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('submits and cancels nothing more once removed', () => {
    const { editor, field, handlers, type, press } = editing();
    type('sunset');

    editor.remove();
    press('Enter');
    press('Escape');
    field.dispatchEvent(new FocusEvent('blur'));

    expect(handlers.submit).not.toHaveBeenCalled();
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  it('keeps the card from being dragged while editing, and restores it afterwards', () => {
    const { editor, card } = editing();

    expect(card.draggable).toBe(false);
    editor.remove();
    expect(card.draggable).toBe(true);
  });
});
