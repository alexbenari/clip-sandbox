const RATE_RELATIVE_TOLERANCE = 1e-4;

export function describeMediaProbe(filePath, sizeBytes, probe) {
  const videoStreams = (probe.streams ?? []).filter((stream) => stream.codec_type === 'video'
    && Number(stream.disposition?.attached_pic ?? 0) !== 1);
  const audioStreams = (probe.streams ?? []).filter((stream) => stream.codec_type === 'audio');
  if (videoStreams.length === 0) {
    throw new Error('No playable video stream was reported (cover art is excluded).');
  }

  const video = videoStreams[0];
  const rotation = readRotation(video);
  const descriptor = {
    path: filePath,
    sizeBytes,
    format: normalizeFormat(probe.format?.format_name),
    videoCodec: video.codec_name ?? 'unknown',
    profile: video.profile ?? 'unknown',
    pixelFormat: video.pix_fmt ?? 'unknown',
    bitDepth: numberOrNull(video.bits_per_raw_sample) ?? inferBitDepth(video.pix_fmt),
    width: numberOrNull(video.width),
    height: numberOrNull(video.height),
    rateClass: classifyRate(video.r_frame_rate, video.avg_frame_rate),
    fieldOrder: video.field_order ?? 'unknown',
    rotation,
    videoTrackCount: videoStreams.length,
    audioCodecs: [...new Set(audioStreams.map((stream) => stream.codec_name ?? 'unknown'))].sort(),
    durationSeconds: numberOrNull(probe.format?.duration),
  };
  return { ...descriptor, signature: signatureOf(descriptor) };
}

export function selectRepresentative(files) {
  if (files.length === 0) throw new Error('Cannot select from an empty media group.');
  return [...files].sort((left, right) => score(right) - score(left) || left.path.localeCompare(right.path))[0];
}

function signatureOf(descriptor) {
  return [
    descriptor.format,
    descriptor.videoCodec,
    descriptor.profile,
    descriptor.pixelFormat,
    descriptor.bitDepth ?? 'unknown',
    descriptor.rateClass,
    descriptor.fieldOrder,
    resolutionClass(descriptor.width, descriptor.height),
    descriptor.rotation,
    descriptor.videoTrackCount,
  ].join('|');
}

function score(file) {
  const pixels = (file.width ?? 0) * (file.height ?? 0);
  const duration = file.durationSeconds ?? 0;
  return Math.log2(Math.max(1, file.sizeBytes)) + Math.log2(Math.max(1, pixels)) + Math.log2(Math.max(1, duration));
}

function normalizeFormat(value = 'unknown') {
  return value.split(',').sort().join(',');
}

function classifyRate(realRate, averageRate) {
  if (!realRate || !averageRate || realRate === '0/0' || averageRate === '0/0') return 'unknown';
  const real = parseRate(realRate);
  const average = parseRate(averageRate);
  if (real === null || average === null || real <= 0 || average <= 0) return 'unknown';
  const relativeDifference = Math.abs(real - average) / Math.max(Math.abs(real), Math.abs(average));
  return relativeDifference <= RATE_RELATIVE_TOLERANCE ? 'cfr' : 'rate-mismatch';
}

function parseRate(value) {
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function resolutionClass(width, height) {
  if (!width || !height) return 'unknown';
  const largest = Math.max(width, height);
  if (largest <= 720) return 'sd';
  if (largest <= 1920) return 'hd';
  if (largest <= 2560) return '2k';
  return '4k+';
}

function inferBitDepth(pixelFormat = '') {
  const match = pixelFormat.match(/(?:p|gbrp)(\d{2})(?:le|be)?$/);
  return match ? Number(match[1]) : 8;
}

function readRotation(video) {
  const sideData = (video.side_data_list ?? []).find((item) => item.rotation !== undefined);
  return numberOrNull(sideData?.rotation) ?? numberOrNull(video.tags?.rotate) ?? 0;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
