import { Collection } from './collection.js';

export type ValidCollectionDescription = {
  ok: true;
  filename: string;
  content: Collection;
};

export type InvalidCollectionDescription = {
  ok: false;
  code: 'invalid-empty' | 'invalid-duplicates';
  filename: string;
  message: string;
  duplicateNames?: string[];
};

export type CollectionDescriptionResult = ValidCollectionDescription | InvalidCollectionDescription;

export class CollectionDescriptionValidator {
  parseText({ text = '', filename = '' }: { text?: string; filename?: string } = {}): CollectionDescriptionResult {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    return this.parseLines({ lines, filename });
  }

  parseLines({ lines = [], filename = '' }: { lines?: Iterable<string>; filename?: string } = {}): CollectionDescriptionResult {
    const orderedClipNames = this.#normalizedLines(lines);
    if (orderedClipNames.length === 0) {
      return {
        ok: false,
        code: 'invalid-empty',
        filename,
        message: 'The file is empty or contains only blank lines.',
      };
    }

    const duplicateNames = this.#duplicateNamesFromLines(orderedClipNames);
    if (duplicateNames.length > 0) {
      return {
        ok: false,
        code: 'invalid-duplicates',
        filename,
        duplicateNames,
        message: `Duplicate entries were found: ${duplicateNames.join(', ')}.`,
      };
    }

    return {
      ok: true,
      filename,
      content: Collection.fromFilename({
        filename,
        orderedClipNames,
      }),
    };
  }

  async parseFile(file: File): Promise<CollectionDescriptionResult> {
    const text = await file.text();
    return this.parseText({
      text,
      filename: file?.name || '',
    });
  }

  formatLogEntry(result: CollectionDescriptionResult | null | undefined, context = 'Collection validation'): string {
    if (!result || result.ok === true) return '';
    const filename = result.filename ? `File: ${result.filename}\n` : '';
    return `${context}\n${filename}Problem: ${result.code}\nDetails: ${result.message}\n\n`;
  }

  #normalizedLines(lines: Iterable<string>): string[] {
    return Array.from(lines || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean);
  }

  #duplicateNamesFromLines(lines: Iterable<string>): string[] {
    const counts = new Map<string, number>();
    for (const name of lines) counts.set(name, (counts.get(name) || 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} (x${count})`);
  }
}

