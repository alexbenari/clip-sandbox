// Pure order validation rules.
export function validateOrderStrict(lines, currentNames) {
  const order = (lines || []).map((s) => s.trim()).filter(Boolean);
  const current = Array.from(currentNames || []);
  const issues = [];

  const counts = new Map();
  for (const n of order) counts.set(n, (counts.get(n) || 0) + 1);
  const dups = Array.from(counts.entries())
    .filter(([, c]) => c > 1)
    .map(([n, c]) => `${n} (x${c})`);
  if (dups.length) issues.push(`Duplicate entries in order file:\n- ${dups.join('\n- ')}`);

  const setOrder = new Set(order);
  const setCurrent = new Set(current);
  const missing = current.filter((n) => !setOrder.has(n));
  const extras = order.filter((n) => !setCurrent.has(n));
  if (missing.length) issues.push(`Missing filenames (present in grid but not in file):\n- ${missing.join('\n- ')}`);
  if (extras.length) issues.push(`Unknown filenames (present in file but not loaded):\n- ${extras.join('\n- ')}`);
  if (setOrder.size !== setCurrent.size)
    issues.push(`Count mismatch: grid has ${setCurrent.size} unique clips, file lists ${setOrder.size}.`);

  return { issues, order };
}
