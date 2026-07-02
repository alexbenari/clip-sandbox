// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';

describe('clip and sequence models', () => {
  test('creates clips with stable identity and mutable metadata', () => {
    const clip = new Clip({
      id: 'clip_1',
      file: new File(['x'], 'alpha.mp4', { type: 'video/mp4' }),
    });
    expect(clip.id).toBe('clip_1');
    expect(clip.name).toBe('alpha.mp4');
    expect(clip.durationSec).toBeNull();
    expect(clip.videoWidth).toBeNull();
    expect(clip.videoHeight).toBeNull();
    expect(clip.hasUsableDimensions()).toBe(false);
    clip.setDuration(12.5);
    expect(clip.durationSec).toBe(12.5);
    clip.setVideoMetadata({ durationSec: 13, videoWidth: 720, videoHeight: 390 });
    expect(clip.durationSec).toBe(13);
    expect(clip.videoWidth).toBe(720);
    expect(clip.videoHeight).toBe(390);
    expect(clip.hasUsableDimensions()).toBe(true);
    clip.markMetadataFailed();
    expect(clip.metadataFailed).toBe(true);
    clip.setVideoMetadata({ durationSec: 14, videoWidth: 0, videoHeight: 390 });
    expect(clip.metadataFailed).toBe(false);
    expect(clip.hasUsableDimensions()).toBe(false);
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

  test('inserts a new clip immediately after a known anchor clip', () => {
    const sequence = new ClipSequence({
      name: 'full',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });

    const inserted = sequence.insertAfter('clip_1', new Clip({
      id: 'clip_3',
      file: new File(['c'], 'alpha-looped.mp4'),
    }));

    expect(inserted).toBe(true);
    expect(sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'alpha-looped.mp4', 'bravo.webm']);
    expect(sequence.insertAfter('missing', new Clip({ id: 'clip_4', file: new File(['d'], 'delta.mp4') }))).toBe(false);
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
    expect(Collection.validateCollectionName('CON')).toMatchObject({
      ok: false,
      code: 'illegal-chars',
    });
    expect(Collection.validateCollectionName('trailing.')).toMatchObject({
      ok: false,
      code: 'illegal-chars',
    });
    expect(Collection.validateCollectionName('name .txt')).toMatchObject({
      ok: false,
      code: 'illegal-chars',
    });

    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.webm'],
    });
    const merged = collection.addClips(['bravo.webm', 'charlie.mp4', 'delta.mp4', 'charlie.mp4']);
    expect(merged.addedClipNames).toEqual(['charlie.mp4', 'delta.mp4']);
    expect(merged.skippedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
    expect(merged.collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4', 'delta.mp4']);

    const pruned = merged.collection.removeVideos(['bravo.webm', 'missing.mp4', 'delta.mp4']);
    expect(pruned.removedClipNames).toEqual(['bravo.webm', 'delta.mp4']);
    expect(pruned.collection.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('treats the pipeline as the full folder and collections as ordered subsets', () => {
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
    expect(pipeline.collections().map((collection) => collection.collectionName)).toEqual(['beta', 'clips-default', 'zeta']);
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

  test('upserts one new video file into the pipeline inventory using filename ordering', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['d'], 'delta.mp4'),
      ],
    });

    expect(pipeline.upsertVideoFile(new File(['a'], 'alpha-looped.mp4'))).toBe(true);
    expect(pipeline.videoNames()).toEqual(['alpha-looped.mp4', 'bravo.webm', 'delta.mp4']);
  });

  test('reuses canonical clips across pipeline and collection materialization', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['a'], 'alpha.mp4'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'subset.txt',
          orderedClipNames: ['bravo.webm'],
        }),
      ],
    });
    const nextClipId = (() => {
      let count = 0;
      return () => `clip_${++count}`;
    })();

    const pipelineSequence = pipeline.materializePipeline({ nextClipId }).sequence;
    const alphaClip = pipelineSequence.getClip('clip_1');
    const bravoClip = pipelineSequence.getClip('clip_2');
    bravoClip.setVideoMetadata({ durationSec: 4, videoWidth: 720, videoHeight: 390 });

    const collectionSequence = pipeline.materializeCollection(
      pipeline.getCollectionByFilename('subset.txt'),
      { nextClipId }
    ).sequence;
    const collectionBravoClip = collectionSequence.orderedClips()[0];
    const secondPipelineSequence = pipeline.materializePipeline({ nextClipId }).sequence;

    expect(collectionBravoClip).toBe(bravoClip);
    expect(collectionBravoClip.videoWidth).toBe(720);
    expect(secondPipelineSequence.orderedClips()).toEqual([alphaClip, bravoClip]);
  });

  test('adds clips to a collection through Pipeline and preserves destination order semantics', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
        new File(['c'], 'charlie.mp4'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'subset.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });

    const existingResult = pipeline.addClipsToCollection({
      collectionFilename: 'subset.txt',
      clipNames: ['charlie.mp4', 'alpha.mp4'],
    });

    expect(existingResult).toMatchObject({
      ok: true,
      code: 'added',
      addedClipNames: ['charlie.mp4'],
      skippedClipNames: ['alpha.mp4'],
      addedCount: 1,
      skippedCount: 1,
      created: false,
    });
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);

    const newResult = pipeline.addClipsToCollection({
      collectionFilename: 'highlights.txt',
      clipNames: ['bravo.webm', 'charlie.mp4'],
    });

    expect(newResult).toMatchObject({
      ok: true,
      code: 'added',
      addedClipNames: ['bravo.webm', 'charlie.mp4'],
      skippedClipNames: [],
      created: true,
    });
    expect(pipeline.getCollectionByFilename('highlights.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
  });

  test('treats collection filename identity as case-insensitive while preserving stored casing', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'Highlights.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });

    expect(pipeline.getCollectionByFilename('highlights.txt')?.filename).toBe('Highlights.txt');
    expect(pipeline.getCollectionByFilename('HIGHLIGHTS.TXT')?.filename).toBe('Highlights.txt');
    expect(pipeline.eligibleDestinationCollections('highlights.txt')).toEqual([]);

    const result = pipeline.addClipsToCollection({
      collectionFilename: 'highlights.txt',
      clipNames: ['bravo.webm'],
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'added',
      created: false,
      filename: 'Highlights.txt',
    });
    expect(result.collection.filename).toBe('Highlights.txt');
    expect(pipeline.collections()).toHaveLength(1);
    expect(pipeline.getCollectionByFilename('Highlights.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
  });

  test('removeVideos prunes pipeline files and delegates collection cleanup per collection', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
        new File(['c'], 'charlie.mp4'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'subset.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
        Collection.fromFilename({
          filename: 'picks.txt',
          orderedClipNames: ['alpha.mp4', 'bravo.webm', 'charlie.mp4'],
        }),
      ],
    });

    const result = pipeline.removeVideos(['alpha.mp4', 'charlie.mp4']);

    expect(result.removedVideoNames).toEqual(['alpha.mp4', 'charlie.mp4']);
    expect(result.changedCollections).toHaveLength(2);
    expect(result.changedCollections[0]).toMatchObject({
      filename: 'picks.txt',
      removedClipNames: ['alpha.mp4', 'charlie.mp4'],
      removedCount: 2,
    });
    expect(result.changedCollections[1]).toMatchObject({
      filename: 'subset.txt',
      removedClipNames: ['alpha.mp4'],
      removedCount: 1,
    });
    expect(pipeline.videoNames()).toEqual(['bravo.webm']);
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.webm']);
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

