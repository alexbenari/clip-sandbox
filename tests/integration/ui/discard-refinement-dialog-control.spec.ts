import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscardRefinementDialogControl } from '../../../src/ui/discard-refinement-dialog-control.js';
import { shippedPageBody } from '../../support/page-markup.js';

const pageBody = shippedPageBody();

function openDialog() {
  const dialog = DiscardRefinementDialogControl.fromDocument(document);
  const confirmed = vi.fn();
  const cancelled = vi.fn();
  dialog.on('confirmed', confirmed);
  dialog.on('cancelled', cancelled);
  return { dialog, confirmed, cancelled };
}

const button = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('#discardRefinementDialog button')]
  .find(candidate => candidate.textContent === name)!;
const dialogElement = (): HTMLDialogElement => document.getElementById('discardRefinementDialog') as HTMLDialogElement;
const question = (): string => document.querySelector('#discardRefinementDialog h2')?.textContent ?? '';

describe('DiscardRefinementDialogControl', () => {
  beforeEach(() => { document.body.innerHTML = pageBody; });

  it('asks about the one staged endpoint it would discard, naming its frame', () => {
    const { dialog } = openDialog();

    dialog.open([{ endpoint: 'end', frameIndex: 7 }]);

    expect(question()).toBe('Discard the staged end (frame 7)?');
    expect(dialogElement().open).toBe(true);
  });

  it('names both staged endpoints when both would be discarded', () => {
    const { dialog } = openDialog();

    dialog.open([{ endpoint: 'start', frameIndex: 3 }, { endpoint: 'end', frameIndex: 1200 }]);

    expect(question()).toBe('Discard the staged start (frame 3) and end (frame 1,200)?');
  });

  it('answers Discard as confirmed and closes', () => {
    const { dialog, confirmed, cancelled } = openDialog();
    dialog.open([{ endpoint: 'end', frameIndex: 7 }]);

    button('Discard').click();

    expect(confirmed).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
    expect(dialogElement().open).toBe(false);
  });

  it('opens on the safe Keep editing choice, and answering it returns focus to the control that was focused', () => {
    const back = document.createElement('button');
    document.body.append(back);
    back.focus();
    const { dialog, cancelled } = openDialog();
    dialog.open([{ endpoint: 'end', frameIndex: 7 }]);
    expect(document.activeElement).toBe(button('Keep editing'));

    button('Keep editing').click();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(dialogElement().open).toBe(false);
    expect(document.activeElement).toBe(back);
  });

  it('treats Escape as Keep editing', () => {
    const { dialog, confirmed, cancelled } = openDialog();
    dialog.open([{ endpoint: 'end', frameIndex: 7 }]);

    document.getElementById('discardRefinementDialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    expect(dialogElement().open).toBe(false);
  });

  it('does not present Discard as the primary action', () => {
    openDialog().dialog.open([{ endpoint: 'end', frameIndex: 7 }]);

    expect(button('Discard').classList.contains('btn-primary')).toBe(false);
  });
});
