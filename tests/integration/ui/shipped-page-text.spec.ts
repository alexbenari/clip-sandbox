import { beforeEach, describe, expect, it } from 'vitest';

import { shippedPageBody } from '../../support/page-markup.js';

const LABELLING_ATTRIBUTES = ['title', 'aria-label', 'placeholder'];

function shippedTexts(): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node.textContent ?? '');
  for (const element of document.body.querySelectorAll('*')) {
    for (const attribute of LABELLING_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) texts.push(value);
    }
  }
  return texts;
}

function textOf(selector: string): string | undefined {
  return document.querySelector(selector)?.textContent?.trim();
}

describe('shipped page text', () => {
  beforeEach(() => { document.body.innerHTML = shippedPageBody(); });

  it('writes every ellipsis as the single ellipsis character', () => {
    expect(shippedTexts().filter(text => text.includes('...'))).toEqual([]);
  });

  it('labels the Collection commands and dialogs in sentence case', () => {
    expect({
      browse: textOf('#pickBtn'),
      addToCollection: textOf('#addToCollectionBtn'),
      titles: textOf('#toggleTitlesBtn'),
      fullScreen: textOf('#fsBtn'),
      fullScreenName: document.querySelector('#fsBtn')?.getAttribute('aria-label'),
      showExistingClips: textOf('#applyCollectionConflictBtn'),
      saveNewCollection: textOf('#confirmSaveAsNewBtn'),
      dontSave: textOf('#discardUnsavedChangesBtn'),
      addDialogHeading: textOf('#addToCollectionDialog h2'),
      continueWithoutSaving: textOf('#discardTrashPreflightBtn'),
      saveAndContinue: textOf('#confirmTrashPreflightBtn'),
      activityHeading: textOf('#activityIndicatorPanel h2'),
    }).toEqual({
      browse: 'Browse folder…',
      addToCollection: 'Add selected to collection…',
      titles: 'Hide titles',
      fullScreen: 'Full screen',
      fullScreenName: 'Full screen',
      showExistingClips: 'Display existing clips only',
      saveNewCollection: 'Save collection',
      dontSave: "Don't save",
      addDialogHeading: 'Add selected to collection',
      continueWithoutSaving: 'Continue without saving',
      saveAndContinue: 'Save and continue',
      activityHeading: 'Activity and errors',
    });
  });
});
