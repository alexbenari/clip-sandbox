const path = require('node:path');
const { Mp4MetadataTagReader } = require('./mp4-metadata-tag-reader.cjs');
const { SourceInfo } = require('./source-info.cjs');

const KEY = 'clip-sandbox.prov.v1';
const MAX_BYTES = 4096;

class Mp4Provenance {
  constructor({ tagReader = new Mp4MetadataTagReader() } = {}) {
    this.tagReader = tagReader;
  }

  tagValueOf(sourceInfo) {
    const serialized = JSON.stringify(sourceInfo.toRecord());
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new Error('Clip provenance exceeds the MP4 metadata limit.');
    return serialized;
  }

  muxArguments(serialized) {
    return ['-movflags', '+faststart+use_metadata_tags', '-metadata', `${KEY}=${serialized}`];
  }

  async readBack(outputPath) {
    const serialized = await this.tagReader.read(outputPath, KEY);
    if (!this.sourceInfoOf(serialized)) throw new Error('Clip provenance is missing or invalid.');
    return serialized;
  }

  canBeTagged(filename) {
    return path.extname(filename).toLowerCase() === '.mp4';
  }

  async read(clipPath) {
    return this.sourceInfoOf(await this.tagReader.read(clipPath, KEY));
  }

  sourceInfoOf(serialized) {
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) return null;
    try {
      return SourceInfo.fromRecord(JSON.parse(serialized));
    } catch {
      return null;
    }
  }
}

module.exports = { KEY, Mp4Provenance };
