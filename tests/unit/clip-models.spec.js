import { describe, expect, test } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';

describe('clip and sequence models', () => {
  test('creates clips with stable identity and mutable duration', () => {
    const clip = new Clip({
      id: 'clip_1',
      file: new File(['x'], 'alpha.mp4', { type: 'video/mp4' }),
    });
    expect(clip.id).toBe('clip_1');
    expect(clip.name).toBe('alpha.mp4');
    expect(clip.durationSec).toBeNull();
    clip.setDuration(12.5);
    expect(clip.durationSec).toBe(12.5);
  });

  test('maintains ordered clip-sequence contents and supports full-order replacement', () => {
    const clips = [
      new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ];
    const sequence = new ClipSequence({ name: 'pipeline-view', clips });
    expect(sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    sequence.replaceOrder(['clip_3', 'clip_1', 'clip_2']);
    expect(sequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_3', 'clip_1', 'clip_2']);
    sequence.rename('subset');
    expect(sequence.name).toBe('subset');
    expect(sequence.getClip('clip_2')?.name).toBe('bravo.webm');
  });

  test('supports removal, batch removal, and ordered lookup by clip ids', () => {
    const sequence = new ClipSequence({
      name: 'full',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
        new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
      ],
    });

    expect(sequence.remove('clip_2')).toBe(true);
    expect(sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'charlie.mp4']);

    const batchSequence = new ClipSequence({
      name: 'full',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
        new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
      ],
    });
    expect(batchSequence.removeMany(['clip_3', 'missing', 'clip_1'])).toEqual(['clip_3', 'clip_1']);
    expect(batchSequence.clipNamesInOrder()).toEqual(['bravo.webm']);
    expect(batchSequence.clipsForIdsInOrder(['clip_2', 'missing']).map((clip) => clip.id)).toEqual(['clip_2']);
    expect(batchSequence.clipNamesForIdsInOrder(['clip_2', 'missing'])).toEqual(['bravo.webm']);
  });

  test('builds collections from runtime clip sequences', () => {
    const sequence = new ClipSequence({
      name: 'director-cut',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });
    const collection = sequence.toCollection({ filename: 'director-cut.txt' });
    expect(collection).toBeInstanceOf(Collection);
    expect(collection.collectionName).toBe('director-cut');
    expect(collection.filename).toBe('director-cut.txt');
    expect(collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
    expect(collection.toText()).toBe('alpha.mp4\nbravo.webm\n');
  });

  test('validates collection names and preserves append/remove semantics', () => {
    expect(Collection.validateCollectionName(' highlights ')).toEqual({
      ok: true,
      code: '',
      name: 'highlights',
      filename: 'highlights.txt',
    });
    expect(Collection.validateCollectionName('')).toMatchObject({
      ok: false,
      code: 'required',
    });
    expect(Collection.validateCollectionName('bad:name')).toMatchObject({
      ok: false,
      code: 'illegal-chars',
    });

    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.webm'],
    });
    const merged = collection.appendMissingClipNames(['bravo.webm', 'charlie.mp4', 'delta.mp4', 'charlie.mp4']);
    expect(merged.addedClipNames).toEqual(['charlie.mp4', 'delta.mp4']);
    expect(merged.skippedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
    expect(merged.collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4', 'delta.mp4']);

    const pruned = merged.collection.withoutClipNames(['bravo.webm', 'missing.mp4', 'delta.mp4']);
    expect(pruned.removedClipNames).toEqual(['bravo.webm', 'delta.mp4']);
    expect(pruned.collection.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('treats the pipeline as the primary source and explicit collections as ordered subsets', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['a'], 'alpha.mp4'),
        new File(['c'], 'charlie.mp4'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'zeta.txt',
          orderedClipNames: ['bravo.webm'],
        }),
        Collection.fromFilename({
          filename: 'clips-default.txt',
          orderedClipNames: ['charlie.mp4', 'alpha.mp4'],
        }),
        Collection.fromFilename({
          filename: 'beta.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });

    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    expect(pipeline.displayLabel()).toBe('clips');
    expect(pipeline.selectableSources().map((source) => source.displayLabel())).toEqual([
      'clips',
      'beta',
      'clips-default',
      'zeta',
    ]);
    expect(pipeline.getCollectionByFilename('clips-default.txt')?.orderedClipNames).toEqual(['charlie.mp4', 'alpha.mp4']);
  });

  test('updates pipeline clip membership when files are removed from disk', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
        new File(['c'], 'charlie.mp4'),
      ],
    });

    pipeline.setVideoFiles([
      new File(['a'], 'alpha.mp4'),
      new File(['c'], 'charlie.mp4'),
    ]);

    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('validates collection description text and reports human-readable diagnostics', () => {
    const validator = new CollectionDescriptionValidator();
    const valid = validator.parseText({
      text: 'alpha.mp4\nbravo.webm\n',
      filename: 'subset.txt',
    });
    expect(valid.ok).toBe(true);
    expect(valid.content.collectionName).toBe('subset');

    const invalid = validator.parseText({
      text: 'alpha.mp4\nalpha.mp4\n',
      filename: 'subset.txt',
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.code).toBe('invalid-duplicates');
    expect(validator.formatLogEntry(invalid)).toContain('Problem: invalid-duplicates');
  });
});
