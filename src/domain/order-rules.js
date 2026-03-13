// Pure collection-file parsing and comparison rules.
export function analyzeCollectionEntries(lines, folderFileNames) {
  const requestedNames = (lines || []).map((s) => s.trim()).filter(Boolean);
  const folderNames = Array.from(folderFileNames || []);

  if (requestedNames.length === 0) {
    return { kind: 'invalid-empty', requestedNames };
  }

  const counts = new Map();
  for (const name of requestedNames) counts.set(name, (counts.get(name) || 0) + 1);
  const duplicateNames = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => `${name} (x${count})`);
  if (duplicateNames.length > 0) {
    return { kind: 'invalid-duplicates', requestedNames, duplicateNames };
  }

  const folderSet = new Set(folderNames);
  const requestedSet = new Set(requestedNames);
  const missingNames = requestedNames.filter((name) => !folderSet.has(name));
  const existingNamesInOrder = requestedNames.filter((name) => folderSet.has(name));

  if (missingNames.length > 0) {
    return {
      kind: 'has-missing',
      requestedNames,
      existingNamesInOrder,
      missingNames,
      missingCount: missingNames.length,
    };
  }

  const isExactMatch = requestedSet.size === folderNames.length && folderNames.every((name) => requestedSet.has(name));
  return {
    kind: isExactMatch ? 'exact-match' : 'subset-match',
    requestedNames,
    existingNamesInOrder: requestedNames.slice(),
  };
}
