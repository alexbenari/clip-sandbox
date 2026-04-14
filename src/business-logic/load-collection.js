import { materializeClipSequenceFromSource } from '../domain/clip-sequence-source.js';

export function materializeSource({
  source,
  pipeline = null,
  nextClipId,
} = {}) {
  if (!source || !nextClipId) return null;
  return materializeClipSequenceFromSource(source, {
    availableVideoFiles: pipeline?.videoFiles?.() || [],
    nextClipId,
  });
}
