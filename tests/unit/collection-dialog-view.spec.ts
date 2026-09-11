// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { AddToCollectionDialogController } from '../../src/ui/add-to-collection-dialog-controller.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { AppText } from '../../src/app/app-text.js';
import { CollectionNameValidator } from '../../src/app/collection-name-validator.js';

describe('collection dialog view helpers', () => {
  const validator = new CollectionNameValidator(new AppText());
  const pipeline = {
    getCollectionByFilename: (filename) => (filename === 'existing.txt' ? { filename } : null),
    eligibleDestinationCollections: () => [
      { collectionName: 'subset', filename: 'subset.txt' },
      { collectionName: 'picks', filename: 'picks.txt' },
    ],
  };

  test('maps add-to-collection validation codes to user-facing copy', () => {
    expect(validator.validationErrorText('required')).toContain('name');
    expect(validator.validationErrorText('illegal-chars')).toContain('cannot');
    expect(validator.validationErrorText('already-exists')).toContain('already exists');
  });

  test('validates add-to-collection and save-as-new names against pipeline collections', () => {
    expect(validator.validate('', pipeline)).toContain('name');
    expect(validator.validate('bad:name', pipeline)).toContain('cannot');
    expect(validator.validate('existing', pipeline)).toContain('already exists');
    expect(validator.validate('fresh', pipeline)).toBe('');
  });

  test('treats case-only collection names as already existing', () => {
    const pipeline = new Pipeline({
      collections: [
        Collection.fromFilename({
          filename: 'Highlights.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });

    expect(validator.validate('highlights', pipeline)).toContain('already exists');
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
