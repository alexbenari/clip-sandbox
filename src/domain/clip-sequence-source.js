function requiresMethod(source, methodName) {
  if (source && typeof source[methodName] === 'function') return source[methodName].bind(source);
  throw new Error(`Clip sequence source is missing required method: ${methodName}`);
}

export function sourceIdOf(source) {
  return requiresMethod(source, 'sourceId')();
}

export function sourceLabelOf(source) {
  return requiresMethod(source, 'displayLabel')();
}

export function sourceBaselineClipNames(source) {
  if (!source) return [];
  return requiresMethod(source, 'baselineClipNames')();
}

export function materializeClipSequenceFromSource(source, options = {}) {
  if (!source) return null;
  return requiresMethod(source, 'materializeClipSequence')(options);
}

export function supportsSaveToExisting(source) {
  return !!(source && typeof source.existingSaveFilename === 'function' && source.existingSaveFilename());
}

export function supportsSaveAsCollection(source) {
  return !!(source && typeof source.toCollection === 'function');
}

export function supportsNonPhysicalDelete(source) {
  return !!(source && typeof source.withoutClipNames === 'function');
}
