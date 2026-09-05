import path from 'node:path';

export function createMediaScope(root, config) {
  if (config?.schemaVersion !== 1 || !Array.isArray(config.excludedFiles) ||
      !Array.isArray(config.excludedDirectories)) {
    throw new Error('Media scope must use schemaVersion 1 and define both exclusion arrays.');
  }

  const resolvedRoot = path.resolve(root);
  const excludedFiles = new Set(config.excludedFiles.map((entry) =>
    normalizedScopedPath(resolvedRoot, entry, 'file')));
  const excludedDirectories = config.excludedDirectories.map((entry) =>
    normalizedScopedPath(resolvedRoot, entry, 'directory'));

  return {
    includes(filePath) {
      const candidate = normalize(path.resolve(filePath));
      return !excludedFiles.has(candidate) &&
        !excludedDirectories.some((directory) => candidate.startsWith(`${directory}${path.sep}`));
    },
  };
}

function normalizedScopedPath(root, relativePath, kind) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`Excluded ${kind} path must be a non-empty path relative to the media root.`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Excluded ${kind} path escapes the media root.`);
  }
  return normalize(resolved);
}

function normalize(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
