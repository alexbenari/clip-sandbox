const fixedDiagnosticIds = ['media-026', 'media-035', 'media-036'];

export function selectPreparationTargets(policyResults, inventory, fixtures = []) {
  const groups = new Map(inventory.groups.map((group) => [group.id, group]));
  const files = new Map(inventory.files.map((file) => [file.path, file]));
  const policies = new Map(policyResults.map((policy) => [policy.id, policy]));
  const targets = [];
  const selected = new Set();

  const addMatrix = (id, kind) => {
    if (selected.has(id)) return;
    const group = groups.get(id);
    const policy = policies.get(id);
    if (!group || !policy) throw new Error(`Preparation target ${id} is missing from the policy matrix.`);
    selected.add(id);
    targets.push({
      id,
      kind,
      sourcePath: group.representativePath,
      signature: group.signature,
      media: files.get(group.representativePath) ?? null,
      policy,
    });
  };

  for (const policy of policyResults) {
    if (policy.action === 'normalize-timestamps') addMatrix(policy.id, 'timestamp-normalization');
  }
  for (const id of fixedDiagnosticIds) addMatrix(id, 'diagnostic-control');
  for (const fixture of fixtures) {
    if (selected.has(fixture.id)) continue;
    selected.add(fixture.id);
    targets.push(fixture);
  }

  const healthyCandidates = policyResults
    .filter((policy) => policy.action === 'use-source' && !selected.has(policy.id))
    .map((policy) => {
      const group = groups.get(policy.id);
      return { policy, group, media: group ? files.get(group.representativePath) : null };
    })
    .filter((candidate) => candidate.group && candidate.media)
    .sort((left, right) => healthyScore(right.media) - healthyScore(left.media));
  if (!healthyCandidates.length) throw new Error('No healthy preparation control is available.');
  addMatrix(healthyCandidates[0].policy.id, 'healthy-control');
  return targets;
}

function healthyScore(media) {
  const commonCodec = ['h264', 'hevc', 'mpeg4'].includes(media.videoCodec) ? 1 : 0;
  const ordinaryResolution = media.width <= 1920 && media.height <= 1080 ? 1 : 0;
  const fullLength = media.durationSeconds >= 3_600 ? 1 : 0;
  return fullLength * 1_000_000 + ordinaryResolution * 100_000 + commonCodec * 10_000 +
    Math.min(media.durationSeconds ?? 0, 9_999);
}
