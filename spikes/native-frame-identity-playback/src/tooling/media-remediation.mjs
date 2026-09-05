const warmAccessTargetMs = 750;

export function classifyPacketScan(scan) {
  const missingKeyPacketPts = scan.keyPacketCount === 0 ||
    scan.keyPacketsWithPts < scan.keyPacketCount;
  const multipleVopEvidence = Number(scan.packetsWithMultipleVops ?? 0) > 0;
  const divxPackedMarkerSeen = Boolean(scan.divxPackedMarkerSeen);
  const packedBFrameStatus = multipleVopEvidence
    ? 'confirmed'
    : divxPackedMarkerSeen ? 'marker-only' : 'none';
  return {
    missingKeyPacketPts,
    packedBFramesDetected: multipleVopEvidence,
    packedBFrameStatus,
    divxPackedMarkerSeen,
    requiresTimestampNormalization: missingKeyPacketPts,
    packedBFrameDiagnosticRecommended:
      scan.codec === 'mpeg4' && multipleVopEvidence,
  };
}

export function repairLevelsFor(media) {
  const levels = [{
    id: 'timestamp-remux',
    kind: 'stream-copy',
    changesPixels: false,
    outputExtension: '.mkv',
  }];
  if (media.codec === 'mpeg4') {
    levels.push({
      id: 'unpack-only-remux',
      kind: 'stream-copy',
      changesPixels: false,
      outputExtension: '.avi',
    });
    levels.push({
      id: 'unpack-and-timestamp-remux',
      kind: 'stream-copy',
      changesPixels: false,
      outputExtension: '.mkv',
    });
  }
  levels.push({
    id: 'all-intra-proxy',
    kind: 'transcode',
    changesPixels: true,
    outputExtension: '.mkv',
  });
  return levels;
}

export function buildRepairArgs(levelId, input, output) {
  const common = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y'];
  const mappedStreams = ['-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0'];
  switch (levelId) {
    case 'timestamp-remux':
      return [...common, '-fflags', '+genpts', '-i', input, ...mappedStreams,
        '-c', 'copy', '-avoid_negative_ts', 'make_non_negative', output];
    case 'unpack-only-remux':
      return [...common, '-i', input, ...mappedStreams, '-c', 'copy',
        '-bsf:v', 'mpeg4_unpack_bframes', output];
    case 'unpack-and-timestamp-remux':
      return [...common, '-fflags', '+genpts', '-i', input, ...mappedStreams,
        '-c', 'copy', '-bsf:v', 'mpeg4_unpack_bframes',
        '-avoid_negative_ts', 'make_non_negative', output];
    case 'all-intra-proxy':
      return [...common, '-fflags', '+genpts', '-i', input, ...mappedStreams,
        '-vf', "scale=w='min(960,iw)':h=-2,settb=1/1000,setpts=N*1000/FRAME_RATE",
        '-c:v', 'mpeg4', '-q:v', '5', '-g', '1', '-bf', '0',
        '-fps_mode', 'passthrough', '-enc_time_base:v', 'filter', '-c:a', 'copy',
        '-avoid_negative_ts', 'make_non_negative', output];
    default:
      throw new Error(`Unknown repair level: ${levelId}`);
  }
}

export function compareSampledContent(baseline, candidate) {
  const candidateFrames = new Map(candidate.frames.map((frame) => [frame.requestedFrame, frame]));
  const comparable = baseline.frames.filter((frame) => candidateFrames.has(frame.requestedFrame));
  return {
    frameCountPreserved: baseline.numFrames === candidate.numFrames,
    sampledPixelsPreserved: comparable.length === baseline.frames.length && comparable.every((frame) =>
      candidateFrames.get(frame.requestedFrame).rgbaHash === frame.rgbaHash),
    comparedFrames: comparable.length,
  };
}

export function assessRepairCandidate({
  content,
  ordinalMappingPreserved = true,
  keyframeCount,
  ptsUsableKeyframeCount,
  probeCompleted,
  warmP95Ms,
  requirePixelIdentity,
}) {
  const usableSeekPoints = keyframeCount > 0 && ptsUsableKeyframeCount > 0;
  const identityPass = content.frameCountPreserved && ordinalMappingPreserved &&
    (!requirePixelIdentity || content.sampledPixelsPreserved);
  const exactAccessPass = usableSeekPoints && probeCompleted;
  const warmAccessPass = exactAccessPass && warmP95Ms <= warmAccessTargetMs;
  return {
    usableSeekPoints,
    identityPass,
    exactAccessPass,
    warmAccessPass,
    viable: identityPass && warmAccessPass,
  };
}
