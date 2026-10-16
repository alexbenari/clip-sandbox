import type { Collection } from '../domain/collection.js';
import { CollectionDescriptionValidator, type CollectionDescriptionResult } from '../domain/collection-description-validator.js';

// A collection's .txt file: one clip filename per line, in order. Reading applies the domain's rules on
// the listed names (not empty, no duplicates).
export class CollectionTextFormat {
  constructor(private readonly validator: Pick<CollectionDescriptionValidator, 'parseLines'> = new CollectionDescriptionValidator()) {}

  write(collection: Collection): string {
    const names = collection.orderedClipNames;
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  }

  read({ text = '', filename = '' }: { text?: string; filename?: string } = {}): CollectionDescriptionResult {
    return this.validator.parseLines({ lines: String(text || '').replace(/\r/g, '').split('\n'), filename });
  }

  async readFile(file: File): Promise<CollectionDescriptionResult> {
    return this.read({ text: await file.text(), filename: file?.name || '' });
  }
}
