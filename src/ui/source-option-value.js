import { createCollectionSourceId, createPipelineSourceId, normalizeSourceId } from '../domain/source-id.js';

export const PIPELINE_SOURCE_OPTION_VALUE = '__pipeline__';

export function serializeSourceIdToOptionValue(sourceId) {
  const normalized = normalizeSourceId(sourceId);
  if (!normalized) return '';
  return normalized.kind === 'pipeline'
    ? PIPELINE_SOURCE_OPTION_VALUE
    : normalized.filename;
}

export function parseSourceIdFromOptionValue(optionValue = '') {
  const trimmed = String(optionValue || '').trim();
  if (!trimmed) return null;
  return trimmed === PIPELINE_SOURCE_OPTION_VALUE
    ? createPipelineSourceId()
    : createCollectionSourceId(trimmed);
}
