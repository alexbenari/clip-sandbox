import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function buildPreparationCacheKey(identity) {
  assertIdentity(identity);
  return createHash('sha256').update(stableStringify(identity)).digest('hex');
}

export function validatePreparationManifest(manifest, identity) {
  if (!manifest || typeof manifest !== 'object') return false;
  try {
    return manifest.cacheKey === buildPreparationCacheKey(identity) &&
      stableStringify(manifest.identity) === stableStringify(identity);
  } catch {
    return false;
  }
}

export function preparationEntryPath(cacheRoot, cacheKey) {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error('Preparation cache key is invalid.');
  const root = path.resolve(cacheRoot);
  const entry = path.resolve(root, cacheKey);
  if (path.dirname(entry) !== root) throw new Error('Preparation cache path escapes its root.');
  return entry;
}

export async function createPreparationWorkspace(cacheRoot, cacheKey, nonce = `${process.pid}-${Date.now()}`) {
  const finalPath = preparationEntryPath(cacheRoot, cacheKey);
  const root = path.dirname(finalPath);
  await mkdir(root, { recursive: true });
  const temporaryPath = path.join(root, `.partial-${cacheKey}-${sanitizeNonce(nonce)}`);
  await mkdir(temporaryPath, { recursive: false });
  return {
    cacheKey,
    temporaryPath,
    finalPath,
    reviewAsset: path.join(temporaryPath, 'review.mkv'),
    index: path.join(temporaryPath, 'index'),
  };
}

export async function publishPreparationWorkspace(workspace, manifest) {
  if (manifest.cacheKey !== workspace.cacheKey) {
    throw new Error('Preparation manifest and workspace cache keys differ.');
  }
  await writeFile(path.join(workspace.temporaryPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await renameWithRetry(workspace.temporaryPath, workspace.finalPath);
  return resolveEntry(workspace.finalPath, manifest);
}

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; ++attempt) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code) || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

export async function loadPreparationEntry(cacheRoot, identity) {
  const cacheKey = buildPreparationCacheKey(identity);
  const entryPath = preparationEntryPath(cacheRoot, cacheKey);
  try {
    const manifest = JSON.parse(await readFile(path.join(entryPath, 'manifest.json'), 'utf8'));
    if (!validatePreparationManifest(manifest, identity)) return null;
    const entry = resolveEntry(entryPath, manifest);
    await access(entry.reviewAsset);
    await access(`${entry.index}.${manifest.indexTrack ?? identity.selectedTrack}.bsindex`);
    return entry;
  } catch {
    return null;
  }
}

function resolveEntry(entryPath, manifest) {
  const reviewAsset = manifest.reviewAssetKind === 'source'
    ? path.resolve(manifest.sourcePath)
    : resolveContained(entryPath, manifest.reviewAsset, 'review asset');
  const index = resolveContained(entryPath, manifest.index, 'index');
  return { cacheKey: manifest.cacheKey, entryPath, reviewAsset, index, manifest };
}

function resolveContained(entryPath, relativePath, label) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error(`Preparation ${label} must be relative to its cache entry.`);
  }
  const resolvedEntry = path.resolve(entryPath);
  const resolved = path.resolve(resolvedEntry, relativePath);
  if (path.dirname(resolved) !== resolvedEntry) {
    throw new Error(`Preparation ${label} escapes its cache entry.`);
  }
  return resolved;
}

function sanitizeNonce(nonce) {
  const value = String(nonce).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!value) throw new Error('Preparation workspace nonce is invalid.');
  return value;
}

function assertIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new Error('Preparation identity must be an object.');
  }
  for (const field of ['sourceSampleDigest', 'sourceBytes', 'durationUs', 'streamMetadataDigest',
    'selectedTrack', 'signatureProfileVersion', 'preparationContractVersion',
    'bestSourceVersion', 'ffmpegVersion', 'indexingOptions']) {
    if (identity[field] === undefined || identity[field] === null) {
      throw new Error(`Preparation identity is missing ${field}.`);
    }
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
