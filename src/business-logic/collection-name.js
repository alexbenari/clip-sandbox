import { ClipCollectionContent } from '../domain/clip-collection-content.js';

export const ILLEGAL_COLLECTION_NAME_CHARS = /[<>:"/\\|?*]/;

export function normalizeCollectionFilename(name) {
  return ClipCollectionContent.filenameFromCollectionName((name || '').trim());
}

export function validateCollectionName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      code: 'required',
      name: '',
      filename: '',
    };
  }
  if (ILLEGAL_COLLECTION_NAME_CHARS.test(trimmed)) {
    return {
      ok: false,
      code: 'illegal-chars',
      name: trimmed,
      filename: '',
    };
  }
  return {
    ok: true,
    code: '',
    name: trimmed,
    filename: normalizeCollectionFilename(trimmed),
  };
}
