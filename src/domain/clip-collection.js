function orderedIdsFromClips(clips) {
  return Array.from(clips || []).map((clip) => clip.id);
}

function clipMapFromClips(clips) {
  return new Map(Array.from(clips || []).map((clip) => [clip.id, clip]));
}

export function createClipCollection({ name = '', clips = [] } = {}) {
  return {
    name: (name || '').trim(),
    orderedClipIds: orderedIdsFromClips(clips),
    clipMap: clipMapFromClips(clips),
  };
}

export function renameClipCollection(collection, name) {
  if (!collection) return;
  collection.name = (name || '').trim();
}

export function getClip(collection, clipId) {
  return collection?.clipMap?.get(clipId) || null;
}

export function orderedClips(collection) {
  if (!collection?.clipMap) return [];
  return Array.from(collection.orderedClipIds || [])
    .map((clipId) => collection.clipMap.get(clipId))
    .filter(Boolean);
}

export function replaceClipOrder(collection, orderedClipIds) {
  if (!collection?.clipMap) return [];
  const seen = new Set();
  const nextOrder = Array.from(orderedClipIds || []).filter((clipId) => {
    if (!collection.clipMap.has(clipId) || seen.has(clipId)) return false;
    seen.add(clipId);
    return true;
  });
  const missing = Array.from(collection.clipMap.keys()).filter((clipId) => !seen.has(clipId));
  collection.orderedClipIds = nextOrder.concat(missing);
  return collection.orderedClipIds.slice();
}

export function removeClipFromCollection(collection, clipId) {
  if (!collection?.clipMap?.has(clipId)) return false;
  collection.clipMap.delete(clipId);
  collection.orderedClipIds = Array.from(collection.orderedClipIds || []).filter((id) => id !== clipId);
  return true;
}

export function clipNamesInOrder(collection) {
  return orderedClips(collection).map((clip) => clip.name);
}

export function createCollectionFromClipNames({ name = '', orderedNames = [], clips = [] } = {}) {
  const clipsByName = new Map(Array.from(clips || []).map((clip) => [clip.name, clip]));
  const ordered = Array.from(orderedNames || [])
    .map((clipName) => clipsByName.get(clipName))
    .filter(Boolean);
  return createClipCollection({ name, clips: ordered });
}
