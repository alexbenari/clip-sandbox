import type { AppText } from './app-text.js';

export class CollectionNameValidator {
  constructor(
    private readonly appText: Pick<
      AppText,
      'saveAsNewNameRequiredText' | 'saveAsNewInvalidNameText' | 'collectionAlreadyExistsText'
    >
  ) {}

  validationErrorText(code: string): string {
    if (code === 'required') return this.appText.saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return this.appText.saveAsNewInvalidNameText();
    if (code === 'already-exists') return this.appText.collectionAlreadyExistsText();
    return '';
  }
}
