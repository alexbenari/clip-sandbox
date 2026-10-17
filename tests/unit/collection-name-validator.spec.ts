import { describe, expect, it } from 'vitest';
import { AppText } from '../../src/app/app-text.js';
import { CollectionNameValidator } from '../../src/app/collection-name-validator.js';

describe('CollectionNameValidator', () => {
  const appText = new AppText();
  const validator = new CollectionNameValidator(appText);

  it('explains each collection-name problem in the dialog wording', () => {
    expect(validator.validationErrorText('required')).toBe(appText.saveAsNewNameRequiredText());
    expect(validator.validationErrorText('illegal-chars')).toBe(appText.saveAsNewInvalidNameText());
    expect(validator.validationErrorText('already-exists')).toBe(appText.collectionAlreadyExistsText());
  });

  it('has no message for a name without a problem', () => {
    expect(validator.validationErrorText('')).toBe('');
  });
});
