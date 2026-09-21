// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { PipelineSession } from '../../src/app/pipeline-session.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

function videoFile(name) {
  return new File(['video'], name, { type: 'video/mp4' });
}

describe('pipeline session', () => {
  test('loads a pipeline selection and resolves clips from the active sequence', () => {
    const session = new PipelineSession();
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
    });

    const result = session.loadPipeline(pipeline);

    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(session.pipeline).toBe(pipeline);
    expect(session.activeCollection).toBeNull();
    expect(session.isPipelineMode()).toBe(true);
    expect(session.hasDirtyClipSequenceChanges).toBe(false);
    expect(session.resolveClip('clip_1').name).toBe('alpha.mp4');
  });

  test('tracks dirty state for active collection order changes', () => {
    const session = new PipelineSession();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
      collections: [collection],
    });
    session.loadPipeline(pipeline);
    const loaded = session.materializeSelection(collection);
    session.activateSelection({
      collection,
      sequence: loaded.materialization.sequence,
    });

    session.replaceCurrentOrder(['clip_2', 'clip_1']);

    expect(session.currentClipSequence.clipNamesInOrder()).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(session.hasDirtyClipSequenceChanges).toBe(true);
  });

  test('inserts a created clip after the source clip in collection mode', () => {
    const session = new PipelineSession();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
      collections: [collection],
    });
    session.loadPipeline(pipeline);
    const loaded = session.materializeSelection(collection);
    session.activateSelection({
      collection,
      sequence: loaded.materialization.sequence,
    });

    const result = session.insertCreatedClipAfter('clip_1', videoFile('alpha-looped.mp4'));

    expect(result.ok).toBe(true);
    expect(result.clip.name).toBe('alpha-looped.mp4');
    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'alpha-looped.mp4', 'bravo.mp4']);
    expect(session.hasDirtyClipSequenceChanges).toBe(true);
    expect(pipeline.videoNames()).toEqual(['alpha-looped.mp4', 'alpha.mp4', 'bravo.mp4']);
  });

  test('does not add a created clip when the collection source clip is missing', () => {
    const session = new PipelineSession();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [videoFile('alpha.mp4')],
      collections: [collection],
    });
    session.loadPipeline(pipeline);
    const loaded = session.materializeSelection(collection);
    session.activateSelection({
      collection,
      sequence: loaded.materialization.sequence,
    });

    const result = session.insertCreatedClipAfter('missing_clip', videoFile('alpha-looped.mp4'));

    expect(result).toEqual({ ok: false, code: 'missing-source-clip' });
    expect(pipeline.videoNames()).toEqual(['alpha.mp4']);
    expect(session.currentClipSequence.clipNamesInOrder()).toEqual(['alpha.mp4']);
  });

  test('inserts a created clip into pipeline mode and rematerializes the active sequence', () => {
    const session = new PipelineSession();
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [videoFile('alpha.mp4')],
    });
    session.loadPipeline(pipeline);

    const result = session.insertCreatedClipInPipeline(videoFile('alpha-looped.mp4'));

    expect(result.ok).toBe(true);
    expect(result.clip.name).toBe('alpha-looped.mp4');
    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha-looped.mp4', 'alpha.mp4']);
    expect(session.currentClipSequence).toBe(result.sequence);
    expect(session.hasDirtyClipSequenceChanges).toBe(false);
  });

  test('publishes a created clip into a named collection without changing the active selection', () => {
    const session = new PipelineSession();
    const pipeline = new Pipeline({ folderName: 'extraction-tmp' });
    session.loadPipeline(pipeline);

    const result = session.publishCreatedClipToCollection('Movie.txt', videoFile('Movie-001.mp4'));

    expect(result.ok).toBe(true);
    expect(result.collection.orderedClipNames).toEqual(['Movie-001.mp4']);
    expect(pipeline.videoNames()).toEqual(['Movie-001.mp4']);
    expect(session.activeCollection).toBeNull();
  });
});

test('dirty state reflects mutations through an escaped active sequence', () => {
  const session = new PipelineSession();
  session.loadPipeline(new Pipeline({ videoFiles: [videoFile('alpha.mp4'), videoFile('bravo.mp4')] }));
  const sequence = session.currentClipSequence;
  sequence.replaceOrder(['clip_2', 'clip_1']);
  expect(session.hasDirtyClipSequenceChanges).toBe(true);
  sequence.replaceOrder(['clip_1', 'clip_2']);
  expect(session.hasDirtyClipSequenceChanges).toBe(false);
  sequence.remove('clip_1');
  expect(session.hasDirtyClipSequenceChanges).toBe(true);
});
