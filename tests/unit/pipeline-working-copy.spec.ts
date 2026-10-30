// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';

function videoFile(name) {
  return clipSource(name);
}

describe('PipelineWorkingCopy', () => {
  test('loads a pipeline selection and resolves clips from the active sequence', () => {
    const session = new PipelineWorkingCopy();
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
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
    const session = new PipelineWorkingCopy();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
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
    const session = new PipelineWorkingCopy();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4', 'bravo.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [videoFile('alpha.mp4'), videoFile('bravo.mp4')],
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
    const session = new PipelineWorkingCopy();
    const collection = Collection.fromFilename({
      filename: 'review.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [videoFile('alpha.mp4')],
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
    const session = new PipelineWorkingCopy();
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [videoFile('alpha.mp4')],
    });
    session.loadPipeline(pipeline);

    const result = session.insertCreatedClipInPipeline(videoFile('alpha-looped.mp4'));

    expect(result.ok).toBe(true);
    expect(result.clip.name).toBe('alpha-looped.mp4');
    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha-looped.mp4', 'alpha.mp4']);
    expect(session.currentClipSequence).toBe(result.sequence);
    expect(session.hasDirtyClipSequenceChanges).toBe(false);
  });

});

test('dirty state reflects mutations through an escaped active sequence', () => {
  const session = new PipelineWorkingCopy();
  session.loadPipeline(new Pipeline({ videoSources: [videoFile('alpha.mp4'), videoFile('bravo.mp4')] }));
  const sequence = session.currentClipSequence;
  sequence.replaceOrder(['clip_2', 'clip_1']);
  expect(session.hasDirtyClipSequenceChanges).toBe(true);
  sequence.replaceOrder(['clip_1', 'clip_2']);
  expect(session.hasDirtyClipSequenceChanges).toBe(false);
  sequence.remove('clip_1');
  expect(session.hasDirtyClipSequenceChanges).toBe(true);
});

describe('PipelineWorkingCopy replacing a clip’s file', () => {
  function workingCopyIn(collection, names = ['alpha.mp4', 'bravo.webm', 'charlie.mp4']) {
    const picks = Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['charlie.mp4', 'bravo.webm', 'alpha.mp4'] });
    const pipeline = new Pipeline({ folderName: 'clips', videoSources: names.map(videoFile), collections: [picks] });
    const session = new PipelineWorkingCopy();
    session.loadPipeline(pipeline);
    if (collection) {
      const { selection, materialization } = session.materializeSelection(pipeline.getCollectionByFilename(collection));
      session.activateSelection({ collection: selection, sequence: materialization.sequence });
    }
    const clip = name => session.currentClipSequence.orderedClips().find(candidate => candidate.name === name);
    return { session, pipeline, clip };
  }

  test('a renamed clip leaves a saved collection’s view saved, in its place', () => {
    const { session, clip } = workingCopyIn('picks.txt');

    session.replaceClipFile(clip('bravo.webm'), videoFile('bravo.mp4'));

    expect(session.currentClipSequence.clipNamesInOrder()).toEqual(['charlie.mp4', 'bravo.mp4', 'alpha.mp4']);
    expect(session.hasDirtyClipSequenceChanges).toBe(false);
  });

  test('a renamed clip moves to where its new name sorts in the folder’s full list, which stays saved', () => {
    const { session, clip } = workingCopyIn(null, ['alpha.mp4', 'bravo.mp4', 'charlie.webm']);

    session.replaceClipFile(clip('charlie.webm'), videoFile('aardvark.mp4'));

    expect(session.currentClipSequence.clipNamesInOrder()).toEqual(['aardvark.mp4', 'alpha.mp4', 'bravo.mp4']);
    expect(session.hasDirtyClipSequenceChanges).toBe(false);
  });

  test('a collection restored to its saved version shows the view as unsaved', () => {
    const { session, pipeline, clip } = workingCopyIn('picks.txt');
    const saved = pipeline.getCollectionByFilename('picks.txt');
    session.replaceClipFile(clip('bravo.webm'), videoFile('bravo.mp4'));

    session.restoreSavedCollection(saved);

    expect(session.activeCollection).toBe(saved);
    expect(session.hasDirtyClipSequenceChanges).toBe(true);
  });
});
