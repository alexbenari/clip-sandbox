import { Collection } from '../domain/collection.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExtractionDestinationSnapshot,
} from '../frame-review/clip-extraction-api.js';

export interface IExtractionDestinationPublication {
  readonly folderPath: string;
  readonly collectionFilename: string | null;
  readonly media: ICreatedExtractionMedia;
}

export type IExtractionDestination =
  | Readonly<{ kind: 'collection'; folderPath: string; collectionFilename: string }>
  | Readonly<{ kind: 'folder'; folderPath: string }>;

export interface IExtractionDestinationSessionSnapshot {
  readonly destinationHandle: string;
  readonly folderPath: string;
  readonly collectionFilename: string;
  readonly collection: Collection;
}

type ExtractionDestinationSessionOptions = {
  readonly onPublished?: (publication: IExtractionDestinationPublication) => Promise<void> | void;
  readonly onPublishError?: (error: unknown) => void;
  readonly destination?: IExtractionDestination;
  readonly collectionParser?: Pick<CollectionDescriptionValidator, 'parseText'>;
};

export class ExtractionDestinationSession {
  private readonly collectionParser: Pick<CollectionDescriptionValidator, 'parseText'>;
  private destinationHandle = '';
  private folderPath = '';
  private collectionFilename = '';
  private collection: Collection | null = null;
  private readonly pendingPublications = new Map<string, ICreatedExtractionMedia>();
  private latestPendingMediaHandle: string | null = null;

  constructor(
    private readonly service: Pick<IClipExtractionService, 'openExtractionDestination' | 'saveCollection'>,
    private readonly options: ExtractionDestinationSessionOptions = {},
  ) {
    this.collectionParser = options.collectionParser ?? new CollectionDescriptionValidator();
  }

  async open({ movieName }: { movieName: string }): Promise<IExtractionDestinationSessionSnapshot> {
    const collectionFilename = (this.options.destination?.kind === 'collection'
      ? this.options.destination.collectionFilename : null)
      ?? Collection.filenameFromCollectionName(this.movieStem(movieName));
    const destination = await this.service.openExtractionDestination(
      this.options.destination ? { folderPath: this.options.destination.folderPath } : undefined);
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
    if (this.options.destination?.kind === 'folder') {
      this.forgetPending(mediaHandle);
      await this.publishCommitted(media, null);
      return;
    }
    // The collection changes only after its file is saved, so a failed save can be retried as is.
    const collection = this.collection!.withExtractionOutput(media.filename);
    await this.service.saveCollection(this.destinationHandle, this.collectionFilename, collection.toText());
    this.collection = collection;
    this.forgetPending(mediaHandle);
    await this.publishCommitted(media, this.collectionFilename);
  }

  private forgetPending(mediaHandle: string): void {
    this.pendingPublications.delete(mediaHandle);
    if (this.latestPendingMediaHandle === mediaHandle) this.latestPendingMediaHandle = null;
  }

  private async publishCommitted(media: ICreatedExtractionMedia, collectionFilename: string | null): Promise<void> {
    try {
      await this.options.onPublished?.(Object.freeze({
        folderPath: this.folderPath,
        collectionFilename,
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
    const parsed = this.collectionParser.parseText({ text: entry.content, filename: entry.filename });
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
