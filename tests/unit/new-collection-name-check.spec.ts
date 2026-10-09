import { describe, expect, it } from 'vitest';

import { AppText } from '../../src/app/app-text.js';
import { CollectionNameValidator } from '../../src/app/collection-name-validator.js';
import { NewCollectionNameCheck } from '../../src/app/new-collection-name-check.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

function checkAgainst(pipeline: Pipeline | null): NewCollectionNameCheck {
  return new NewCollectionNameCheck({ pipeline }, new CollectionNameValidator(new AppText()));
}

const pipelineWithHighlights = new Pipeline({
  collections: [Collection.fromFilename({ filename: 'Highlights.txt', orderedClipNames: ['alpha.mp4'] })],
});

describe('NewCollectionNameCheck', () => {
  it('accepts a valid name that no collection uses and gives its file name', () => {
    expect(checkAgainst(pipelineWithHighlights).check(' fresh ')).toEqual({ kind: 'accepted', name: 'fresh', filename: 'fresh.txt' });
  });

  it('rejects an empty name with the required-name message', () => {
    const appText = new AppText();
    expect(checkAgainst(pipelineWithHighlights).check('  ')).toEqual({
      kind: 'rejected', problem: 'required', message: appText.saveAsNewNameRequiredText(),
    });
  });

  it('rejects a name with characters a file name cannot contain', () => {
    expect(checkAgainst(pipelineWithHighlights).check('bad:name')).toMatchObject({ kind: 'rejected', problem: 'illegal-chars' });
  });

  it('rejects a name already used by a collection, ignoring letter case', () => {
    const appText = new AppText();
    expect(checkAgainst(pipelineWithHighlights).check('highlights')).toEqual({
      kind: 'rejected', problem: 'already-exists', message: appText.collectionAlreadyExistsText(),
    });
  });

  it('accepts any valid name when no pipeline is loaded', () => {
    expect(checkAgainst(null).check('highlights')).toMatchObject({ kind: 'accepted', filename: 'highlights.txt' });
  });

  it('gives the dialog text for a rejected name and no text for an accepted one', () => {
    const check = checkAgainst(pipelineWithHighlights);
    expect(check.problemText('Highlights')).toContain('already exists');
    expect(check.problemText('fresh')).toBe('');
  });
});
