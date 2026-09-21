export interface IExtractionDestinationEntry {
  readonly kind: 'video' | 'collection';
  readonly filename: string;
  readonly type?: string;
  readonly size?: number;
  readonly lastModifiedMs?: number;
  readonly content?: string;
}

export interface IExtractionDestinationSnapshot {
  readonly destinationHandle: string;
  readonly folderPath: string;
  readonly entries: readonly IExtractionDestinationEntry[];
}

export interface IExactClipExtractionRequest {
  readonly sourceHandle: string;
  readonly destinationHandle: string;
  readonly sourceGeneration: number;
  readonly collectionName: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
}

export interface ICreatedExtractionMedia {
  readonly kind: 'created-media';
  readonly mediaHandle: string;
  readonly filename: string;
  readonly type?: string;
  readonly size?: number;
  readonly lastModifiedMs?: number;
}

export interface IClipExtractionService {
  openExtractionDestination(): Promise<IExtractionDestinationSnapshot>;
  extract(request: IExactClipExtractionRequest): Promise<ICreatedExtractionMedia>;
  saveCollection(destinationHandle: string, filename: string, text: string): Promise<void>;
  cancelCurrent?(): Promise<void>;
}
