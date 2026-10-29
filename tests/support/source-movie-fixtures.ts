import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/source-movie');

export const sourceMovieTag: Readonly<{ key: string; value: string }> = JSON.parse(
  fs.readFileSync(path.join(fixtureFolder, 'expected-tag.json'), 'utf8'),
);

export const sourceMovieTagsV2: Readonly<{ key: string; bothEnds: string; singleReference: string }> = JSON.parse(
  fs.readFileSync(path.join(fixtureFolder, 'expected-tag-v2.json'), 'utf8'),
);

export function sourceMovieFixture(name: string): string {
  return path.join(fixtureFolder, name);
}
