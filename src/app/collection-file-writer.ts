import type { Collection } from '../domain/collection.js';
import { CollectionTextFormat } from '../business-logic/collection-text-format.js';
import type { FolderAccess } from './folder-access.js';

export interface ITextFileSaver {
  saveTextFile(request: { folderAccess: FolderAccess | null; filename?: string; text?: string }): Promise<{ mode?: string }>;
}

export interface IOpenFolderSource {
  readonly currentFolderAccess: FolderAccess | null;
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
      folderAccess: this.openFolder.currentFolderAccess,
      filename: collection.filename,
      text: this.format.write(collection),
    });
    return { mode };
  }
}
