const path = require('node:path');

const KEY = 'clip-sandbox.prov.v1';
const MAX_BYTES = 4096;

class Mp4Provenance {
  create(source, start, end) {
    const identity = source.identity;
    const fingerprint = {
      fingerprintVersion: 1,
      sourceSampleDigest: identity.sourceSampleDigest,
      sourceBytes: identity.sourceBytes,
      sourceDurationUs: identity.sourceDurationUs,
      signatureProfileVersion: identity.signatureProfileVersion,
      selectedStream: identity.selectedStream,
      streamMetadataDigest: identity.streamMetadataDigest,
    };
    const endpoint = frame => ({ frameIndex: frame.frameIndex, frameInfoHash: frame.frameInfoHash });
    const record = {
      provenanceVersion: 1,
      sourceMovie: { displayName: path.basename(source.sourcePath), fingerprint },
      sourceFrameRange: { start: endpoint(start), end: endpoint(end), endInclusive: true },
    };
    this.validate(record);
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new Error('Clip provenance exceeds the MP4 metadata limit.');
    return serialized;
  }

  muxArguments(serialized) {
    return ['-movflags', '+faststart+use_metadata_tags', '-metadata', `${KEY}=${serialized}`];
  }

  async readBack(ffprobe, outputPath, runCommand, environment, signal) {
    const result = await runCommand(ffprobe, [
      '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', outputPath,
    ], { signal, env: environment });
    if (!result.ok) throw new Error('Clip provenance could not be read back.');
    const document = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, ''));
    const serialized = document?.format?.tags?.[KEY];
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
      throw new Error('Clip provenance is missing or too large.');
    }
    const record = JSON.parse(serialized);
    this.validate(record);
    return serialized;
  }

  async read(ffprobe, outputPath, runCommand, environment, signal) {
    try {
      const serialized = await this.readBack(ffprobe, outputPath, runCommand, environment, signal);
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }

  validate(record) {
    const fingerprint = record?.sourceMovie?.fingerprint;
    const range = record?.sourceFrameRange;
    const validEndpoint = frame => frame && Number.isSafeInteger(frame.frameIndex) && frame.frameIndex >= 0
      && typeof frame.frameInfoHash === 'string' && /^[a-f0-9]{16}$/.test(frame.frameInfoHash);
    if (record?.provenanceVersion !== 1 || typeof record.sourceMovie?.displayName !== 'string'
      || record.sourceMovie.displayName.length < 1 || record.sourceMovie.displayName.length > 512
      || fingerprint?.fingerprintVersion !== 1
      || typeof fingerprint.sourceSampleDigest !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint.sourceSampleDigest)
      || typeof fingerprint.streamMetadataDigest !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint.streamMetadataDigest)
      || typeof fingerprint.sourceBytes !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(fingerprint.sourceBytes)
      || typeof fingerprint.sourceDurationUs !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(fingerprint.sourceDurationUs)
      || typeof fingerprint.signatureProfileVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(fingerprint.signatureProfileVersion)
      || !Number.isSafeInteger(fingerprint.selectedStream) || fingerprint.selectedStream < 0
      || !validEndpoint(range?.start) || !validEndpoint(range?.end)
      || range.end.frameIndex < range.start.frameIndex || range.endInclusive !== true) {
      throw new Error('Clip provenance is invalid or unsupported.');
    }
  }
}

module.exports = { KEY, Mp4Provenance };
