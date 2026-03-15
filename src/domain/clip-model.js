export function createClip({ id, file, durationSec = null } = {}) {
  if (!id) throw new Error('Clip id is required.');
  if (!file) throw new Error('Clip file is required.');
  return {
    id,
    name: file.name,
    file,
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
  };
}

export function setClipDuration(clip, durationSec) {
  if (!clip) return;
  clip.durationSec = Number.isFinite(durationSec) ? durationSec : null;
}
