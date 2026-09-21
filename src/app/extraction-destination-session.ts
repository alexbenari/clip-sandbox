import { Collection } from '../domain/collection.js';
import { Pipeline } from '../domain/pipeline.js';
import type { ClipFile } from '../domain/clip.js';
import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExtractionDestinationSnapshot,
} from '../frame-review/clip-extraction-api.js';
import { PipelineSession } from './pipeline-session.js';

export interface IExtractionDestinationPublication {
  readonly folderPath: string;
  readonly collectionFilename: string;
  readonly media: ICreatedExtractionMedia;
}

export interface IExtractionDestinationSessionSnapshot {
  readonly destinationHandle: string;
  readonly folderPath: string;
  readonly collectionFilename: string;
  readonly collection: Collection;
}

type ExtractionDestinationSessionOptions = {
  readonly onCollectionPublished?: (publication: IExtractionDestinationPublication) => Promise<void> | void;
  readonly onCollectionPublishedError?: (error: unknown) => void;
};

export class ExtractionDestinationSession {
  private readonly pipelineSession = new PipelineSession();
  private destinationHandle = '';
  private folderPath = '';
  private collectionFilename = '';
  private collection: Collection | null = null;
  private readonly pendingPublications = new Map<string, ICreatedExtractionMedia>();
  private latestPendingMediaHandle: string | null = null;

  constructor(
    private readonly service: Pick<IClipExtractionService, 'openExtractionDestination' | 'saveCollection'>,
    private readonly options: ExtractionDestinationSessionOptions = {},
  ) {}

  async open({ movieName }: { movieName: string }): Promise<IExtractionDestinationSessionSnapshot> {
    const collectionName = this.movieStem(movieName);
    const collectionFilename = Collection.filenameFromCollectionName(collectionName);
    const destination = await this.service.openExtractionDestination();
    this.loadPipeline(destination);
    this.destinationHandle = destination.destinationHandle;
    this.folderPath = destination.folderPath;
    this.collectionFilename = collectionFilename;
    this.collection = this.pipelineSession.pipeline?.getCollectionByFilename(collectionFilename)
      ?? Collection.fromFilename({ filename: collectionFilename, orderedClipNames: [] });
    return this.snapshot();
  }

  async lock(): Promise<IExtractionDestinationSessionSnapshot> {
    return this.snapshot();
  }

  async publishCreatedMedia(media: ICreatedExtractionMedia): Promise<void> {
    this.assertOpen();
    this.pendingPublications.set(media.mediaHandle, media);
    this.latestPendingMediaHandle = media.mediaHandle;
    await this.persist(media.mediaHandle);
  }

  async retryPublication(mediaHandle: string | null = this.latestPendingMediaHandle): Promise<void> {
    if (!mediaHandle || !this.pendingPublications.has(mediaHandle)) {
      throw new Error('There is no collection publication to retry.');
    }
    await this.persist(mediaHandle);
  }

  private async persist(mediaHandle: string): Promise<void> {
    const media = this.pendingPublications.get(mediaHandle);
    if (!media) throw new Error('There is no collection publication to persist.');
    const collection = this.collectionWith(media.filename);
    await this.service.saveCollection(this.destinationHandle, this.collectionFilename, collection.toText());
    const publication = this.pipelineSession.publishCreatedClipToCollection(
      this.collectionFilename, this.clipFile(media));
    if (!publication.ok) throw new Error('The extracted clip could not be added to its collection.');
    this.pipelineSession.pipeline?.upsertCollection(collection);
    this.collection = collection;
    this.pendingPublications.delete(mediaHandle);
    if (this.latestPendingMediaHandle === mediaHandle) this.latestPendingMediaHandle = null;
    await this.publishCollectionCommitted(media);
  }

  private async publishCollectionCommitted(media: ICreatedExtractionMedia): Promise<void> {
    try {
      await this.options.onCollectionPublished?.(Object.freeze({
        folderPath: this.folderPath,
        collectionFilename: this.collectionFilename,
        media,
      }));
    } catch (error) {
      this.options.onCollectionPublishedError?.(error);
    }
  }

  private collectionWith(filename: string): Collection {
    const appended = this.collection!.appendMissingClipNames([filename]).collection;
    const prefix = `${this.collection!.collectionName}-`;
    return appended.withOrderedClipNames(appended.orderedClipNames.sort((left, right) => {
      const leftSequence = this.outputSequence(left, prefix);
      const rightSequence = this.outputSequence(right, prefix);
      return leftSequence === null || rightSequence === null ? 0 : leftSequence - rightSequence;
    }));
  }

  private outputSequence(filename: string, prefix: string): number | null {
    if (!filename.toLowerCase().startsWith(prefix.toLowerCase()) || !/\.mp4$/i.test(filename)) return null;
    const sequenceText = filename.slice(prefix.length, -4);
    return /^\d+$/.test(sequenceText) ? Number(sequenceText) : null;
  }

  private loadPipeline(destination: IExtractionDestinationSnapshot): void {
    const collections = destination.entries.flatMap(entry => {
      if (entry.kind !== 'collection' || typeof entry.content !== 'string') return [];
      return [Collection.fromFilename({
        filename: entry.filename,
        orderedClipNames: entry.content.split(/\r?\n/).map(name => name.trim()).filter(Boolean),
      })];
    });
    const videoFiles = destination.entries.flatMap(entry => entry.kind === 'video'
      ? [this.clipFile({ filename: entry.filename, type: entry.type, size: entry.size, lastModifiedMs: entry.lastModifiedMs })]
      : []);
    this.pipelineSession.loadPipeline(new Pipeline({
      folderName: 'extraction-tmp',
      videoFiles,
      collections,
    }));
  }

  private clipFile(media: Pick<ICreatedExtractionMedia, 'filename' | 'type' | 'size' | 'lastModifiedMs'>): ClipFile {
    const file = new File(
      media.size && media.size > 0 ? [new Uint8Array(Math.min(media.size, 1))] : [],
      media.filename,
      { type: media.type ?? 'video/mp4', lastModified: media.lastModifiedMs ?? Date.now() },
    ) as ClipFile;
    Object.defineProperty(file, 'mediaSource', { value: '', enumerable: true });
    return file;
  }

  private movieStem(movieName: string): string {
    const trimmed = String(movieName || '').trim();
    const stem = trimmed.replace(/\.[^.]+$/, '');
    const validation = Collection.validateCollectionName(stem);
    if (!validation.ok) throw new Error('The movie filename cannot be used as a collection name.');
    return validation.name;
  }

  private snapshot(): IExtractionDestinationSessionSnapshot {
    this.assertOpen();
    return Object.freeze({
      destinationHandle: this.destinationHandle,
      folderPath: this.folderPath,
      collectionFilename: this.collectionFilename,
      collection: this.collection!,
    });
  }

  private assertOpen(): void {
    if (!this.destinationHandle || !this.folderPath || !this.collection || !this.collectionFilename) {
      throw new Error('The extraction destination is not open.');
    }
  }
}
