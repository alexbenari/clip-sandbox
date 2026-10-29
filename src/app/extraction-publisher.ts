import { Collection } from '../domain/collection.js';
import { CollectionTextFormat } from '../business-logic/collection-text-format.js';
import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExtractionDestinationSnapshot,
} from '../business-logic/clip-extraction-service.js';

export interface IExtractionDestinationPublication {
  readonly folderPath: string;
  readonly collectionFilename: string;
  readonly media: ICreatedExtractionMedia;
}

export interface IOpenedExtractionDestination {
  readonly destinationHandle: string;
  readonly folderPath: string;
  readonly collectionFilename: string;
  readonly collection: Collection;
}

type ExtractionPublisherOptions = {
  readonly onPublished?: (publication: IExtractionDestinationPublication) => Promise<void> | void;
  readonly onPublishError?: (error: unknown) => void;
  readonly collectionFormat?: Pick<CollectionTextFormat, 'read' | 'write'>;
};

export class ExtractionPublisher {
  private readonly collectionFormat: Pick<CollectionTextFormat, 'read' | 'write'>;
  private destinationHandle = '';
  private folderPath = '';
  private collectionFilename = '';
  private collection: Collection | null = null;
  private readonly pendingPublications = new Map<string, ICreatedExtractionMedia>();
  private latestPendingMediaHandle: string | null = null;

  constructor(
    private readonly service: Pick<IClipExtractionService, 'openExtractionDestination' | 'saveCollection'>,
    private readonly options: ExtractionPublisherOptions = {},
  ) {
    this.collectionFormat = options.collectionFormat ?? new CollectionTextFormat();
  }

  async open({ movieName }: { movieName: string }): Promise<IOpenedExtractionDestination> {
    const collectionFilename = Collection.filenameFromCollectionName(this.movieStem(movieName));
    const destination = await this.service.openExtractionDestination();
    const collection = this.existingCollection(destination, collectionFilename)
      ?? Collection.fromFilename({ filename: collectionFilename, orderedClipNames: [] });
    this.destinationHandle = destination.destinationHandle;
    this.folderPath = destination.folderPath;
    this.collectionFilename = collectionFilename;
    this.collection = collection;
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
    // The collection changes only after its file is saved, so a failed save can be retried as is.
    const collection = this.collection!.withExtractionOutput(media.filename);
    await this.service.saveCollection(this.destinationHandle, this.collectionFilename, this.collectionFormat.write(collection));
    this.collection = collection;
    this.forgetPending(mediaHandle);
    await this.publishCommitted(media);
  }

  private forgetPending(mediaHandle: string): void {
    this.pendingPublications.delete(mediaHandle);
    if (this.latestPendingMediaHandle === mediaHandle) this.latestPendingMediaHandle = null;
  }

  private async publishCommitted(media: ICreatedExtractionMedia): Promise<void> {
    try {
      await this.options.onPublished?.(Object.freeze({
        folderPath: this.folderPath,
        collectionFilename: this.collectionFilename,
        media,
      }));
    } catch (error) {
      this.options.onPublishError?.(error);
    }
  }

  // Reads the target collection with the same rules as opening a folder. An empty file is an empty
  // collection; a file with duplicate entries is refused rather than rewritten.
  private existingCollection(destination: IExtractionDestinationSnapshot, collectionFilename: string): Collection | null {
    const identityKey = Collection.identityKeyFromFilename(collectionFilename);
    const entry = destination.entries.find(candidate => candidate.kind === 'collection'
      && Collection.identityKeyFromFilename(candidate.filename) === identityKey);
    if (!entry || typeof entry.content !== 'string') return null;
    const parsed = this.collectionFormat.read({ text: entry.content, filename: entry.filename });
    if (!('code' in parsed)) return parsed.content;
    if (parsed.code === 'invalid-empty') return Collection.fromFilename({ filename: entry.filename, orderedClipNames: [] });
    throw new Error(`${entry.filename} cannot receive new clips. ${parsed.message} Remove the duplicate lines, then extract again.`);
  }

  private movieStem(movieName: string): string {
    const trimmed = String(movieName || '').trim();
    const stem = trimmed.replace(/\.[^.]+$/, '');
    const validation = Collection.validateCollectionName(stem);
    if (!validation.ok) throw new Error('The movie filename cannot be used as a collection name.');
    return validation.name;
  }

  private snapshot(): IOpenedExtractionDestination {
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
