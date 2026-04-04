import { describe, expect, test, vi } from 'vitest';
import { runLoadClips } from '../../src/business-logic/load-clips.js';
import { runLoadCollection, runLoadCollectionFromFile } from '../../src/business-logic/load-collection.js';
import { persistCollectionContent, runSaveOrder } from '../../src/business-logic/save-order.js';
import { ClipCollectionContent } from '../../src/domain/clip-collection-content.js';

describe('business logic modules', () => {
  test('runLoadClips filters, sorts, creates clips, and builds a collection', () => {
    const result = runLoadClips({
      fileList: [
        { name: 'b.mp4', type: 'video/mp4' },
        { name: 'note.txt', type: 'text/plain' },
        { name: 'a.mp4', type: 'video/mp4' },
      ],
      collectionName: 'Folder A',
      defaultCollectionName: 'All Clips',
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });
    expect(result.files.map((file) => file.name)).toEqual(['a.mp4', 'b.mp4']);
    expect(result.clips.map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
    expect(result.collection.name).toBe('Folder A');
    expect(result.collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
    expect(result.count).toBe(2);
  });

  test('runLoadClips leaves collection name empty when no videos are present', () => {
    const result = runLoadClips({
      fileList: [{ name: 'note.txt', type: 'text/plain' }],
      collectionName: 'Folder A',
      defaultCollectionName: 'All Clips',
      nextClipId: vi.fn(),
    });
    expect(result.count).toBe(0);
    expect(result.collection.name).toBe('');
    expect(result.collection.orderedClips()).toEqual([]);
  });

  test('runLoadCollection rejects blank collections', () => {
    const result = runLoadCollection({
      lines: ['', '  '],
      file: { name: 'subset.txt' },
      folderClipNames: ['a.mp4'],
      folderClips: [],
      currentCollectionName: 'All Clips',
    });
    expect(result.kind).toBe('invalid-empty');
    expect(result.collectionName).toBe('subset');
  });

  test('runLoadCollection rejects duplicate entries', () => {
    const result = runLoadCollection({
      lines: ['a.mp4', 'a.mp4'],
      file: { name: 'subset.txt' },
      folderClipNames: ['a.mp4', 'b.mp4'],
      folderClips: [],
      currentCollectionName: 'All Clips',
    });
    expect(result.kind).toBe('invalid-duplicates');
    expect(result.duplicateNames).toContain('a.mp4 (x2)');
  });

  test('runLoadCollection builds exact-match and subset collections', () => {
    const clips = [
      { id: 'clip_1', name: 'a.mp4' },
      { id: 'clip_2', name: 'b.mp4' },
      { id: 'clip_3', name: 'c.mp4' },
    ];
    const exact = runLoadCollection({
      lines: ['b.mp4', 'a.mp4', 'c.mp4'],
      file: { name: 'ordered.txt' },
      folderClipNames: ['a.mp4', 'b.mp4', 'c.mp4'],
      folderClips: clips,
      currentCollectionName: 'All Clips',
    });
    expect(exact.kind).toBe('loaded');
    expect(exact.matchKind).toBe('exact-match');
    expect(exact.collection.name).toBe('ordered');
    expect(exact.collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_2', 'clip_1', 'clip_3']);

    const subset = runLoadCollection({
      lines: ['c.mp4', 'a.mp4'],
      file: { name: 'subset.txt' },
      folderClipNames: ['a.mp4', 'b.mp4', 'c.mp4'],
      folderClips: clips,
      currentCollectionName: 'All Clips',
    });
    expect(subset.kind).toBe('loaded');
    expect(subset.matchKind).toBe('subset-match');
    expect(subset.collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_3', 'clip_1']);
  });

  test('runLoadCollection returns conflict details and partial collection for missing entries', () => {
    const clips = [
      { id: 'clip_1', name: 'a.mp4' },
      { id: 'clip_2', name: 'b.mp4' },
    ];
    const result = runLoadCollection({
      lines: ['b.mp4', 'missing.mp4', 'a.mp4'],
      file: { name: 'subset.txt' },
      folderClipNames: ['a.mp4', 'b.mp4'],
      folderClips: clips,
      currentCollectionName: 'All Clips',
    });
    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.existingNamesInOrder).toEqual(['b.mp4', 'a.mp4']);
    expect(result.partialCollection.orderedClips().map((clip) => clip.id)).toEqual(['clip_2', 'clip_1']);
  });

  test('runLoadCollectionFromFile reads file text and delegates to collection loading', async () => {
    const result = await runLoadCollectionFromFile({
      file: {
        name: 'subset.txt',
        text: () => Promise.resolve('b.mp4\r\na.mp4\n'),
      },
      folderClipNames: ['a.mp4', 'b.mp4'],
      folderClips: [
        { id: 'clip_1', name: 'a.mp4' },
        { id: 'clip_2', name: 'b.mp4' },
      ],
      currentCollectionName: 'All Clips',
    });

    expect(result.kind).toBe('loaded');
    expect(result.collection.name).toBe('subset');
    expect(result.collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_2', 'clip_1']);
  });

  test('runSaveOrder uses direct write when handle is available', async () => {
    const saveTextToDirectory = vi.fn(async () => {});
    const downloadText = vi.fn();
    const showStatus = vi.fn();
    const mode = await runSaveOrder({
      names: ['one.mp4', 'two.webm'],
      currentDirHandle: { kind: 'directory', getFileHandle: vi.fn() },
      saveTextToDirectory,
      downloadText,
      showStatus,
    });
    expect(mode).toBe('saved');
    expect(saveTextToDirectory).toHaveBeenCalledOnce();
    expect(saveTextToDirectory).toHaveBeenCalledWith(expect.anything(), 'default-collection.txt', 'one.mp4\ntwo.webm\n');
    expect(downloadText).not.toHaveBeenCalled();
    expect(showStatus).toHaveBeenCalledWith('Saved default-collection.txt to the selected folder.');
  });

  test('runSaveOrder supports named collection files', async () => {
    const saveTextToDirectory = vi.fn(async () => {});
    const downloadText = vi.fn();
    const showStatus = vi.fn();
    const mode = await runSaveOrder({
      names: ['one.mp4'],
      filename: 'my-cut.txt',
      currentDirHandle: null,
      saveTextToDirectory,
      downloadText,
      showStatus,
      buildSavedStatus: (name) => `Saved ${name}`,
      buildDownloadedStatus: (name) => `Downloaded ${name}`,
    });
    expect(mode).toBe('downloaded');
    expect(downloadText).toHaveBeenCalledWith('my-cut.txt', 'one.mp4\n');
    expect(showStatus).toHaveBeenCalledWith('Downloaded my-cut.txt');
  });

  test('persistCollectionContent serializes content and reuses save fallback behavior without status concerns', async () => {
    const saveTextToDirectory = vi.fn(async () => {});
    const downloadText = vi.fn();
    const content = ClipCollectionContent.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['one.mp4', 'two.webm'],
    });

    const result = await persistCollectionContent({
      content,
      currentDirHandle: { kind: 'directory', getFileHandle: vi.fn() },
      saveTextToDirectory,
      downloadText,
    });

    expect(result).toEqual({ mode: 'saved' });
    expect(saveTextToDirectory).toHaveBeenCalledWith(
      expect.anything(),
      'subset.txt',
      'one.mp4\ntwo.webm\n',
    );
    expect(downloadText).not.toHaveBeenCalled();
  });
});
