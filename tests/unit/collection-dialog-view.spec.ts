// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AddToCollectionDialogController } from '../../src/ui/add-to-collection-dialog-controller.js';
import { validateSaveAsNewName } from '../../src/ui/save-as-new-dialog-controller.js';

describe('collection dialog view helpers', () => {
  const pipeline = {
    getCollectionByFilename: (filename) => (filename === 'existing.txt' ? { filename } : null),
    eligibleDestinationCollections: () => [
      { collectionName: 'subset', filename: 'subset.txt' },
      { collectionName: 'picks', filename: 'picks.txt' },
    ],
  };

  test('maps add-to-collection validation codes to user-facing copy', () => {
    expect(AddToCollectionDialogController.validationErrorText('required')).toContain('name');
    expect(AddToCollectionDialogController.validationErrorText('illegal-chars')).toContain('cannot');
    expect(AddToCollectionDialogController.validationErrorText('already-exists')).toContain('already exists');
  });

  test('validates add-to-collection and save-as-new names against pipeline collections', () => {
    expect(AddToCollectionDialogController.validateName({ name: '', pipeline })).toContain('name');
    expect(AddToCollectionDialogController.validateName({ name: 'bad:name', pipeline })).toContain('cannot');
    expect(AddToCollectionDialogController.validateName({ name: 'existing', pipeline })).toContain('already exists');
    expect(validateSaveAsNewName({ name: 'existing', pipeline })).toContain('already exists');
    expect(validateSaveAsNewName({ name: 'fresh', pipeline })).toBe('');
  });

  test('builds add-to-collection destination choices from the pipeline', () => {
    expect(AddToCollectionDialogController.buildChoices({
      pipeline,
      activeCollectionFilename: 'ignored.txt',
    })).toEqual([
      { label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' },
      { label: 'picks', value: 'picks.txt', collectionFilename: 'picks.txt' },
    ]);
  });
});
