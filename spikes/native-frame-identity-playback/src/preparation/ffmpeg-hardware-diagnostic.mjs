import { buildProxyEncodingArgs } from './all-intra-proxy-preparation.mjs';

export function buildBoundedSoftwareProxyArgs(input, output, profile, audioStreamOrdinal, bounds) {
  const selectedBounds = assertBounds(bounds);
  const args = buildProxyEncodingArgs(input, output, profile, audioStreamOrdinal);
  if (selectedBounds.durationSeconds === null) return args;
  const inputOption = args.indexOf('-i');
  args.splice(inputOption, 0, '-ss', String(selectedBounds.startSeconds));
  const inputPath = args.indexOf(input, inputOption + 2);
  args.splice(inputPath + 1, 0, '-t', String(selectedBounds.durationSeconds));
  return args;
}

export function buildQsvDecodeProxyArgs(input, output, profile, audioStreamOrdinal, bounds) {
  const selectedBounds = assertBounds(bounds);
  const selectedProfile = assertDiagnosticProfile(profile);
  const sourceCodec = assertQsvSourceCodec(selectedBounds.sourceCodec);
  const targetSize = assertQsvTargetSize(selectedBounds, selectedProfile.maxWidth);
  const audio = audioStreamOrdinal === null ? [] : [
    '-map', `0:a:${assertAudioOrdinal(audioStreamOrdinal)}?`,
    '-c:a', selectedProfile.audio.codec,
    '-b:a', `${Math.round(selectedProfile.audio.bitrate / 1000)}k`,
    '-ac', String(selectedProfile.audio.channels),
    '-ar', String(selectedProfile.audio.sampleRate),
    '-af', `aresample=${selectedProfile.audio.sampleRate}:async=1:first_pts=0,asetpts=PTS-STARTPTS`,
  ];
  const inputBounds = selectedBounds.durationSeconds === null ? [] : [
    '-ss', String(selectedBounds.startSeconds), '-noaccurate_seek',
    '-t', String(selectedBounds.durationSeconds),
  ];
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-init_hw_device', 'qsv=hw,child_device_type=dxva2', '-filter_hw_device', 'hw',
    '-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv',
    '-c:v', `${sourceCodec}_qsv`,
    '-fflags', '+genpts', ...inputBounds, '-i', input,
    '-map', '0:v:0', ...audio, '-map_metadata', '-1', '-sn', '-dn',
    '-vf', `scale_qsv=w=${targetSize.width}:h=${targetSize.height}:format=nv12,hwdownload,format=nv12,` +
      `format=${selectedProfile.pixelFormat},settb=1/${selectedProfile.clockTicksPerSecond},` +
      "setpts='if(isnan(PREV_OUTPTS),0,max(PTS-STARTPTS,PREV_OUTPTS+1))'",
    '-c:v', selectedProfile.videoCodec,
    '-q:v', String(selectedProfile.quantizer),
    '-g', String(selectedProfile.gopSize),
    '-bf', String(selectedProfile.bFrames),
    '-pix_fmt', selectedProfile.pixelFormat,
    '-fps_mode', 'passthrough', '-enc_time_base:v', `1:${selectedProfile.clockTicksPerSecond}`,
    '-avoid_negative_ts', 'make_non_negative',
    '-progress', 'pipe:1', '-nostats', output,
  ];
}

function assertBounds(value) {
  if (!value || !Number.isFinite(value.startSeconds) || value.startSeconds < 0 ||
      value.durationSeconds !== null && (!Number.isFinite(value.durationSeconds) ||
        value.durationSeconds <= 0 || value.durationSeconds > 600) ||
      value.durationSeconds === null && value.startSeconds !== 0) {
    throw new Error('Hardware diagnostic bounds are invalid.');
  }
  return value;
}

function assertDiagnosticProfile(value) {
  if (!value || value.container !== 'matroska' || value.videoCodec !== 'mpeg4' ||
      value.pixelFormat !== 'yuv420p' || value.gopSize !== 1 || value.bFrames !== 0 ||
      value.timing !== 'source-relative-monotonic') {
    throw new Error('Hardware diagnostic requires the selected Phase 3B proxy profile.');
  }
  return value;
}

function assertAudioOrdinal(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1024) {
    throw new Error('Hardware diagnostic audio stream ordinal is invalid.');
  }
  return value;
}

function assertQsvSourceCodec(value) {
  if (!['h264', 'hevc'].includes(value)) {
    throw new Error('QSV diagnostic supports H.264 and HEVC source video only.');
  }
  return value;
}

function assertQsvTargetSize(value, maximumWidth) {
  if (!Number.isSafeInteger(value.targetWidth) || value.targetWidth < 2 || value.targetWidth > maximumWidth ||
      !Number.isSafeInteger(value.targetHeight) || value.targetHeight < 2 || value.targetHeight > 8192 ||
      value.targetWidth % 2 !== 0 || value.targetHeight % 2 !== 0) {
    throw new Error('QSV diagnostic target dimensions must be positive even integers within the proxy bounds.');
  }
  return { width: value.targetWidth, height: value.targetHeight };
}
