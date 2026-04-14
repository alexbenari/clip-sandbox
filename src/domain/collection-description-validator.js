import { Collection } from './collection.js';

export class CollectionDescriptionValidator {
  parseText({ text = '', filename = '' } = {}) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    return this.parseLines({ lines, filename });
  }

  parseLines({ lines = [], filename = '' } = {}) {
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

  async parseFile(file) {
    const text = await file.text();
    return this.parseText({
      text,
      filename: file?.name || '',
    });
  }

  formatLogEntry(result, context = 'Collection validation') {
    if (!result || result.ok) return '';
    const filename = result.filename ? `File: ${result.filename}\n` : '';
    return `${context}\n${filename}Problem: ${result.code}\nDetails: ${result.message}\n\n`;
  }

  #normalizedLines(lines) {
    return Array.from(lines || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean);
  }

  #duplicateNamesFromLines(lines) {
    const counts = new Map();
    for (const name of lines) counts.set(name, (counts.get(name) || 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} (x${count})`);
  }
}
