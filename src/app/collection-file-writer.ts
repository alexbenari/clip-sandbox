import type { Collection } from '../domain/collection.js';
import { CollectionTextFormat } from '../business-logic/collection-text-format.js';

export interface ITextFileSaver {
  saveTextFile(request: { folderSession?: unknown; filename?: string; text?: string }): Promise<{ mode?: string }>;
}

export interface IOpenFolderSource {
  readonly currentFolderSession: unknown;
}

export class CollectionFileWriter {
  constructor(
    private readonly files: ITextFileSaver,
    private readonly openFolder: IOpenFolderSource,
    private readonly format: Pick<CollectionTextFormat, 'write'> = new CollectionTextFormat(),
  ) {}

  async write(collection: Collection): Promise<{ mode: string | undefined }> {
    if (!collection.filename) throw new Error('Collection filename is required.');
    const { mode } = await this.files.saveTextFile({
      folderSession: this.openFolder.currentFolderSession,
      filename: collection.filename,
      text: this.format.write(collection),
    });
    return { mode };
  }
}
