// @vitest-environment node
// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { ClipSource } from '../../src/domain/clip-source.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { CollectionTextFormat } from '../../src/business-logic/collection-text-format.js';
import { testClip, clipSource } from '../support/clip-source-fixtures.js';

describe('domain models: clips, sequences, collections and pipelines', () => {
  test('creates clips with stable identity and mutable metadata', () => {
    const clip = new Clip({
      id: 'clip_1',
      source: clipSource('alpha.mp4'),
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
      testClip('clip_1', 'alpha.mp4'),
      testClip('clip_2', 'bravo.webm'),
      testClip('clip_3', 'charlie.mp4'),
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
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
        testClip('clip_3', 'charlie.mp4'),
      ],
    });

    expect(sequence.remove('clip_2')).toBe(true);
    expect(sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'charlie.mp4']);

    const batchSequence = new ClipSequence({
      name: 'full',
      clips: [
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
        testClip('clip_3', 'charlie.mp4'),
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
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
      ],
    });

    const inserted = sequence.insertAfter('clip_1', new Clip({
      id: 'clip_3',
      source: clipSource('alpha-looped.mp4'),
    }));

    expect(inserted).toBe(true);
    expect(sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'alpha-looped.mp4', 'bravo.webm']);
    expect(sequence.insertAfter('missing', testClip('clip_4', 'delta.mp4'))).toBe(false);
  });

  test('builds collections from runtime clip sequences', () => {
    const sequence = new ClipSequence({
      name: 'director-cut',
      clips: [
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
      ],
    });
    const collection = sequence.toCollection({ filename: 'director-cut.txt' });
    expect(collection).toBeInstanceOf(Collection);
    expect(collection.collectionName).toBe('director-cut');
    expect(collection.filename).toBe('director-cut.txt');
    expect(collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
    expect(new CollectionTextFormat().write(collection)).toBe('alpha.mp4\nbravo.webm\n');
  });

  test('adds an extraction output in sequence without reordering existing entries', () => {
    const movie = Collection.fromFilename({ filename: 'Movie.txt', orderedClipNames: ['intro.mp4', 'Movie-001.mp4', 'Movie-003.mp4'] });

    expect(movie.withExtractionOutput('Movie-004.mp4').orderedClipNames)
      .toEqual(['intro.mp4', 'Movie-001.mp4', 'Movie-003.mp4', 'Movie-004.mp4']);
    expect(movie.withExtractionOutput('Movie-002.mp4').orderedClipNames)
      .toEqual(['intro.mp4', 'Movie-001.mp4', 'Movie-002.mp4', 'Movie-003.mp4']);
    expect(movie.withExtractionOutput('other.mp4').orderedClipNames)
      .toEqual(['intro.mp4', 'Movie-001.mp4', 'Movie-003.mp4', 'other.mp4']);
    expect(movie.withExtractionOutput('Movie-003.mp4')).toBe(movie);
    expect(movie.orderedClipNames).toEqual(['intro.mp4', 'Movie-001.mp4', 'Movie-003.mp4']);
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
    const merged = collection.withClipsAdded(['bravo.webm', 'charlie.mp4', 'delta.mp4', 'charlie.mp4']);
    expect(merged.addedClipNames).toEqual(['charlie.mp4', 'delta.mp4']);
    expect(merged.skippedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
    expect(merged.collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4', 'delta.mp4']);

    const pruned = merged.collection.withoutClips(['bravo.webm', 'missing.mp4', 'delta.mp4']);
    expect(pruned.removedClipNames).toEqual(['bravo.webm', 'delta.mp4']);
    expect(pruned.collection.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('treats the pipeline as the full folder and collections as ordered subsets', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('bravo.webm'),
        clipSource('alpha.mp4'),
        clipSource('charlie.mp4'),
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
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
        clipSource('charlie.mp4'),
      ],
    });

    pipeline.setVideoSources([
      clipSource('alpha.mp4'),
      clipSource('charlie.mp4'),
    ]);

    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('upserts one new video file into the pipeline inventory using filename ordering', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('bravo.webm'),
        clipSource('delta.mp4'),
      ],
    });

    expect(pipeline.upsertVideoSource(clipSource('alpha-looped.mp4'))).toBe(true);
    expect(pipeline.videoNames()).toEqual(['alpha-looped.mp4', 'bravo.webm', 'delta.mp4']);
  });

  test('reuses canonical clips across pipeline and collection materialization', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('bravo.webm'),
        clipSource('alpha.mp4'),
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
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
        clipSource('charlie.mp4'),
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
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
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
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
        clipSource('charlie.mp4'),
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
    const format = new CollectionTextFormat();
    const valid = format.read({
      text: 'alpha.mp4\nbravo.webm\n',
      filename: 'subset.txt',
    });
    expect(valid.ok).toBe(true);
    expect(valid.content.collectionName).toBe('subset');

    const invalid = format.read({
      text: 'alpha.mp4\nalpha.mp4\n',
      filename: 'subset.txt',
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.code).toBe('invalid-duplicates');
  });
});


test('a clip keeps an immutable source and follows its replacement', () => {
  const clip = new Clip({ id: 'a', source: clipSource('alpha.mp4', { mediaSource: 'file:///a.mp4', desktopPath: 'C:/a.mp4' }) });
  expect(clip.source).toBeInstanceOf(ClipSource);
  expect(Reflect.set(clip.source, 'mediaSource', 'file:///c.mp4')).toBe(false);
  expect(clip.mediaSource).toBe('file:///a.mp4');
  expect(clip.source.desktopPath).toBe('C:/a.mp4');
  clip.replaceSource(clipSource('alpha.mp4', { mediaSource: 'file:///b.mp4' }));
  expect(clip.mediaSource).toBe('file:///b.mp4');
  expect(() => clip.replaceSource({ name: 'alpha.mp4', mediaSource: 'file:///d.mp4' })).toThrow('Clip source is required.');
});

test('clip sources carry no frame-review session capability', () => {
  const source = ClipSource.create({ name: 'alpha.mp4', mediaSource: 'file:///a.mp4', frameReviewSourceHandle: 'source_12345678' });

  expect(Object.hasOwn(source, 'frameReviewSourceHandle')).toBe(false);
});

describe('replacing a clip’s file', () => {
  const sourceMovie = { fileName: 'Sample Feature.mkv' };

  function pipelineWith(names, collections = []) {
    const pipeline = new Pipeline({ folderName: 'clips', videoSources: names.map(name => clipSource(name)), collections });
    let nextId = 0;
    const clips = pipeline.materializePipeline({ nextClipId: () => `clip_${++nextId}` }).sequence.orderedClips();
    return { pipeline, clips };
  }

  test('a clip given a new file forgets the duration, size and source movie of the previous one', () => {
    const clip = new Clip({ id: 'clip_1', source: clipSource('alpha.mp4'), durationSec: 4, videoWidth: 720, videoHeight: 390 });
    clip.recordSourceMovie(sourceMovie);
    const replacement = clipSource('alpha.mp4', { mediaSource: 'file:///clips/alpha.mp4?modified=2' });

    clip.replaceFile(replacement);

    expect([clip.id, clip.source, clip.durationSec, clip.videoWidth, clip.videoHeight, clip.sourceMovie])
      .toEqual(['clip_1', replacement, null, null, null, null]);
  });

  test('a file replaced under the same name keeps the clip and changes no collection', () => {
    const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['bravo.mp4', 'alpha.mp4'] });
    const { pipeline, clips: [alpha] } = pipelineWith(['alpha.mp4', 'bravo.mp4'], [picks]);
    const replacement = clipSource('alpha.mp4', { mediaSource: 'file:///clips/alpha.mp4?modified=2' });

    const result = pipeline.replaceVideoFile(alpha, replacement);

    expect(result).toEqual({ clip: alpha, changedCollections: [] });
    expect(pipeline.clipMap().get('alpha.mp4')).toBe(alpha);
    expect(pipeline.videoSources().find(source => source.name === 'alpha.mp4')).toBe(replacement);
  });

  test('a file replaced under a new name renames the clip in the folder and in every collection that lists it', () => {
    const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['bravo.webm', 'alpha.mp4'] });
    const others = Collection.fromFilename({ filename: 'others.txt', orderedClipNames: ['alpha.mp4'] });
    const { pipeline, clips: [, bravo] } = pipelineWith(['alpha.mp4', 'bravo.webm'], [picks, others]);

    const result = pipeline.replaceVideoFile(bravo, clipSource('bravo.mp4'));

    expect(result.clip).toBe(bravo);
    expect(result.changedCollections.map(change => [change.filename, change.collection.orderedClipNames, change.previousCollection]))
      .toEqual([['picks.txt', ['bravo.mp4', 'alpha.mp4'], picks]]);
    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(pipeline.getCollectionByFilename('picks.txt').orderedClipNames).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(pipeline.clipMap().get('bravo.mp4')).toBe(bravo);
  });

  test('a collection that already lists the new name keeps the clip only once, in its first place', () => {
    const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['bravo.webm', 'alpha.mp4', 'bravo.mp4'] });

    expect(picks.withClipRenamed('bravo.webm', 'bravo.mp4').collection.orderedClipNames).toEqual(['bravo.mp4', 'alpha.mp4']);
  });

  test('a clip the pipeline does not hold is not replaced', () => {
    const { pipeline } = pipelineWith(['alpha.mp4']);
    const stranger = new Clip({ id: 'clip_9', source: clipSource('alpha.mp4') });

    expect(pipeline.replaceVideoFile(stranger, clipSource('alpha.mp4'))).toBeNull();
  });
});
