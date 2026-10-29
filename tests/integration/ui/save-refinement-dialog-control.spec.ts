import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SaveRefinementDialogControl } from '../../../src/ui/save-refinement-dialog-control.js';
import { shippedPageBody } from '../../support/page-markup.js';

const pageBody = shippedPageBody();

function saveDialog() {
  const dialog = SaveRefinementDialogControl.fromDocument(document);
  const confirmed = vi.fn();
  const cancelled = vi.fn();
  dialog.on('confirmed', confirmed);
  dialog.on('cancelled', cancelled);
  return { dialog, confirmed, cancelled };
}

const dialogElement = (): HTMLDialogElement => document.getElementById('saveRefinementDialog') as HTMLDialogElement;
const button = (name: string): HTMLButtonElement => [...dialogElement().querySelectorAll<HTMLButtonElement>('button')]
  .find(candidate => candidate.textContent === name)!;

describe('SaveRefinementDialogControl', () => {
  beforeEach(() => { document.body.innerHTML = pageBody; });

  it('starts closed', () => {
    const { dialog } = saveDialog();

    expect(dialog.isOpen()).toBe(false);
  });

  it('explains both choices for the clip being saved', () => {
    const { dialog } = saveDialog();

    dialog.open('alpha.webm');

    expect(dialogElement().open).toBe(true);
    expect(document.getElementById('saveRefinementExplanation')?.textContent).toBe(
      'Keep both adds the refined clip next to alpha.webm. Replace puts it in place of alpha.webm and moves the original to the Recycle Bin.',
    );
  });

  it.each([
    ['Keep both', 'keep-both'],
    ['Replace', 'replace'],
  ])('answers %s with that outcome and closes', (name, outcome) => {
    const { dialog, confirmed, cancelled } = saveDialog();
    dialog.open('alpha.mp4');

    button(name).click();

    expect(confirmed.mock.calls).toEqual([[outcome]]);
    expect(cancelled).not.toHaveBeenCalled();
    expect(dialog.isOpen()).toBe(false);
  });

  it('answers Cancel as cancelled and returns focus to what was focused', () => {
    const frame = document.createElement('div');
    frame.tabIndex = -1;
    document.body.append(frame);
    frame.focus();
    const { dialog, confirmed, cancelled } = saveDialog();
    dialog.open('alpha.mp4');

    button('Cancel').click();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(frame);
  });

  it('treats Escape as Cancel', () => {
    const { dialog, cancelled } = saveDialog();
    dialog.open('alpha.mp4');

    dialogElement().dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(cancelled).toHaveBeenCalledOnce();
    expect(dialog.isOpen()).toBe(false);
  });

  it('opens on the safe Keep both choice and marks Replace as removing a file', () => {
    saveDialog().dialog.open('alpha.mp4');

    expect(document.activeElement).toBe(button('Keep both'));
    expect(button('Replace').classList.contains('btn-destructive')).toBe(true);
  });
});
