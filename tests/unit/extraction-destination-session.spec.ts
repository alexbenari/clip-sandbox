// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

import { ExtractionDestinationSession } from '../../src/app/extraction-destination-session.js';
import { Collection } from '../../src/domain/collection.js';

function destinationService(overrides: Record<string, unknown> = {}) {
  return {
    openExtractionDestination: vi.fn(async () => ({
      destinationHandle: 'destination_opaque_0001',
      folderPath: 'C:/pipelines/extraction-tmp',
      entries: [],
    })),
    saveCollection: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('ExtractionDestinationSession', () => {
  it('publishes a refined folder clip without writing a collection file', async () => {
    const service = destinationService();
    const onPublished = vi.fn(async () => undefined);
    const session = new ExtractionDestinationSession(service, {
      destination: { kind: 'folder', folderPath: 'C:/pipelines/extraction-tmp' }, onPublished,
    });
    await session.open({ movieName: 'Sample Movie.mp4' });
    await session.publishCreatedMedia({ mediaHandle: 'media_opaque_0001', filename: 'Sample Movie-001.mp4' });
    expect(service.openExtractionDestination).toHaveBeenCalledWith({ folderPath: 'C:/pipelines/extraction-tmp' });
    expect(service.saveCollection).not.toHaveBeenCalled();
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: 'C:/pipelines/extraction-tmp', collectionFilename: null,
    }));
  });
  it('publishes a refined collection clip into its originating collection', async () => {
    const service = destinationService({
      openExtractionDestination: vi.fn(async () => ({
        destinationHandle: 'destination_opaque_0001', folderPath: 'C:/pipelines/camera',
        entries: [{ kind: 'collection', filename: 'Favorites.txt', content: 'old.mp4\n' }],
      })),
    });
    const session = new ExtractionDestinationSession(service, {
      destination: { kind: 'collection', folderPath: 'C:/pipelines/camera', collectionFilename: 'Favorites.txt' },
    });
    await session.open({ movieName: 'source.mkv' });
    await session.publishCreatedMedia({ mediaHandle: 'media_opaque_0001', filename: 'Favorites-001.mp4' });
    expect(service.openExtractionDestination).toHaveBeenCalledWith({ folderPath: 'C:/pipelines/camera' });
    expect(service.saveCollection).toHaveBeenCalledWith(
      'destination_opaque_0001', 'Favorites.txt', 'old.mp4\nFavorites-001.mp4\n');
  });
  it('opens the fixed destination snapshot and derives a movie-stem collection filename', async () => {
    const service = destinationService({
      openExtractionDestination: vi.fn(async () => ({
        destinationHandle: 'destination_opaque_0001',
        folderPath: 'C:/pipelines/extraction-tmp',
        entries: [{ kind: 'collection', filename: 'Sample Movie.txt', content: 'old-001.mp4\n' }],
      })),
    });
    const session = new ExtractionDestinationSession(service);

    const snapshot = await session.open({ movieName: 'Sample Movie.mp4' });

    expect(service.openExtractionDestination).toHaveBeenCalledOnce();
    expect(snapshot.destinationHandle).toBe('destination_opaque_0001');
    expect(snapshot.folderPath).toBe('C:/pipelines/extraction-tmp');
    expect(snapshot.collectionFilename).toBe(Collection.filenameFromCollectionName('Sample Movie'));
    expect(snapshot.collection.orderedClipNames).toEqual(['old-001.mp4']);
  });

  it('does not save a collection when opening or locking the destination', async () => {
    const service = destinationService();
    const session = new ExtractionDestinationSession(service);

    await session.open({ movieName: 'Sample Movie.mp4' });
    await session.lock();

    expect(service.saveCollection).not.toHaveBeenCalled();
  });

  it('publishes created media and persists serialized membership only after successful extraction', async () => {
    const service = destinationService();
    const onPublished = vi.fn(async () => undefined);
    const session = new ExtractionDestinationSession(service, { onPublished });
    await session.open({ movieName: 'Sample Movie.mp4' });

    await session.publishCreatedMedia({ mediaHandle: 'media_opaque_0001', filename: 'Sample Movie-001.mp4' });

    expect(service.saveCollection).toHaveBeenCalledWith(
      'destination_opaque_0001',
      'Sample Movie.txt',
      'Sample Movie-001.mp4\n',
    );
    expect(onPublished).toHaveBeenCalledWith({
      folderPath: 'C:/pipelines/extraction-tmp',
      collectionFilename: 'Sample Movie.txt',
      media: expect.objectContaining({ filename: 'Sample Movie-001.mp4' }),
    });
    expect(service.saveCollection.mock.invocationCallOrder[0])
      .toBeLessThan(onPublished.mock.invocationCallOrder[0]);
  });

  it('retains pending publication state so a save failure retries without re-encoding', async () => {
    const saveCollection = vi.fn()
      .mockRejectedValueOnce(new Error('collection write failed'))
      .mockResolvedValueOnce(undefined);
    const service = destinationService({ saveCollection });
    const onPublished = vi.fn(async () => undefined);
    const session = new ExtractionDestinationSession(service, { onPublished });
    await session.open({ movieName: 'Sample Movie.mp4' });

    await expect(session.publishCreatedMedia({ mediaHandle: 'media_opaque_0001', filename: 'Sample Movie-001.mp4' })).rejects.toThrow('collection write failed');
    expect(onPublished).not.toHaveBeenCalled();
    await session.retryPublication();

    expect(saveCollection).toHaveBeenCalledTimes(2);
    expect(saveCollection.mock.calls[0]).toEqual(saveCollection.mock.calls[1]);
    expect(onPublished).toHaveBeenCalledOnce();
  });

  it('appends new media without reordering a saved collection order', async () => {
    const service = destinationService({
      openExtractionDestination: vi.fn(async () => ({
        destinationHandle: 'destination_opaque_0001', folderPath: 'C:/pipelines/extraction-tmp',
        entries: [{ kind: 'collection', filename: 'Sample Movie.txt',
          content: 'Sample Movie-002.mp4\nSample Movie-001.mp4\n' }],
      })),
    });
    const session = new ExtractionDestinationSession(service);
    await session.open({ movieName: 'Sample Movie.mp4' });

    await session.publishCreatedMedia({ mediaHandle: 'media_opaque_0003', filename: 'Sample Movie-003.mp4' });

    expect(service.saveCollection).toHaveBeenCalledWith(
      'destination_opaque_0001',
      'Sample Movie.txt',
      'Sample Movie-002.mp4\nSample Movie-001.mp4\nSample Movie-003.mp4\n',
    );
  });

  it('rebases a failed publication retry onto later successful collection membership', async () => {
    const saveCollection = vi.fn()
      .mockRejectedValueOnce(new Error('collection write failed'))
      .mockResolvedValue(undefined);
    const session = new ExtractionDestinationSession(destinationService({ saveCollection }));
    await session.open({ movieName: 'Sample Movie.mp4' });

    await expect(session.publishCreatedMedia({
      mediaHandle: 'media_opaque_0001', filename: 'Sample Movie-001.mp4',
    })).rejects.toThrow('collection write failed');
    await session.publishCreatedMedia({
      mediaHandle: 'media_opaque_0002', filename: 'Sample Movie-002.mp4',
    });
    await session.retryPublication('media_opaque_0001');

    expect(saveCollection).toHaveBeenLastCalledWith(
      'destination_opaque_0001',
      'Sample Movie.txt',
      'Sample Movie-001.mp4\nSample Movie-002.mp4\n',
    );
  });
});
