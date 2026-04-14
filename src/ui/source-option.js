import { sourceIdOf, sourceLabelOf } from '../domain/clip-sequence-source.js';
import { serializeSourceIdToOptionValue } from './source-option-value.js';

export function createSourceOption(source) {
  const sourceId = sourceIdOf(source);
  return {
    label: sourceLabelOf(source),
    value: serializeSourceIdToOptionValue(sourceId),
    sourceId,
  };
}
