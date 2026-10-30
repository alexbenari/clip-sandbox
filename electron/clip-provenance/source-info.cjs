const path = require('node:path');
const { FrameTime } = require('../frame-time.cjs');

const INVALID = 'Clip provenance is invalid or unsupported.';
const MAX_REFERENCE_FRAMES = 4;

class SourceInfo {
  static #creating = false;

  constructor(sourceMovie, range, referenceFrames) {
    if (!SourceInfo.#creating) throw new Error('Source info is built only through its factories.');
    this.sourceMovie = sourceMovie;
    this.range = range;
    this.referenceFrames = referenceFrames;
    Object.freeze(this);
  }

  static fromRecord(record) {
    if (record?.provenanceVersion === 1) return SourceInfo.#fromVersionOne(record);
    if (record?.provenanceVersion === 2) return SourceInfo.#fromVersionTwo(record);
    throw new Error(INVALID);
  }

  static forMovieRange(sourceMovie, range, referenceFrames) {
    return SourceInfo.#validated(sourceMovie, range, referenceFrames);
  }

  static movieOf(sourcePath, identity) {
    return {
      displayName: path.basename(sourcePath),
      fingerprint: {
        fingerprintVersion: 1,
        sourceSampleDigest: identity.sourceSampleDigest,
        sourceBytes: identity.sourceBytes,
        sourceDurationUs: identity.sourceDurationUs,
        signatureProfileVersion: identity.signatureProfileVersion,
        selectedStream: identity.selectedStream,
        streamMetadataDigest: identity.streamMetadataDigest,
      },
    };
  }

  // Undefined when the time cannot be stored as a safe JSON integer, so the record leaves it out.
  static timeUsOf(frame) {
    return FrameTime.safeMicrosecondsOf(frame);
  }

  static #fromVersionOne(record) {
    const { start, end, endInclusive } = record.sourceFrameRange ?? {};
    if (endInclusive !== true || !start || !end) throw new Error(INVALID);
    return SourceInfo.#validated(record.sourceMovie, { start: start.frameIndex, end: end.frameIndex }, [start, end]);
  }

  // A record with neither a range nor reference frames keeps only the movie.
  static #fromVersionTwo(record) {
    if (record.sourceFrameRange === undefined && record.referenceFrames === undefined) {
      return SourceInfo.#movieOnly(record.sourceMovie);
    }
    const { start, end, endInclusive, startTimeUs, endTimeUs } = record.sourceFrameRange ?? {};
    if (endInclusive !== true) throw new Error(INVALID);
    return SourceInfo.#validated(record.sourceMovie, { start, end, startTimeUs, endTimeUs }, record.referenceFrames);
  }

  static #movieOnly(sourceMovie) {
    if (!SourceInfo.#isValidMovie(sourceMovie)) throw new Error(INVALID);
    return SourceInfo.#created(sourceMovie, null, []);
  }

  // Reference frames need not lie inside the range: a clip trimmed without its movie keeps its old anchors.
  static #validated(sourceMovie, range, referenceFrames) {
    if (!SourceInfo.#isValidMovie(sourceMovie) || !SourceInfo.#isValidRange(range)
      || !Array.isArray(referenceFrames) || referenceFrames.length < 1 || referenceFrames.length > MAX_REFERENCE_FRAMES
      || !referenceFrames.every(frame => SourceInfo.#isValidReferenceFrame(frame))) {
      throw new Error(INVALID);
    }
    return SourceInfo.#created(sourceMovie, {
      start: range.start, end: range.end,
      ...(range.startTimeUs === undefined ? {} : { startTimeUs: range.startTimeUs }),
      ...(range.endTimeUs === undefined ? {} : { endTimeUs: range.endTimeUs }),
    }, referenceFrames);
  }

  static #created(sourceMovie, range, referenceFrames) {
    const { displayName, fingerprint } = sourceMovie;
    SourceInfo.#creating = true;
    try {
      return new SourceInfo(
        Object.freeze({ displayName, fingerprint: Object.freeze({ ...fingerprint }) }),
        range === null ? null : Object.freeze(range),
        Object.freeze(referenceFrames.map(({ frameIndex, frameInfoHash }) => Object.freeze({ frameIndex, frameInfoHash }))),
      );
    } finally {
      SourceInfo.#creating = false;
    }
  }

  static #isValidMovie(sourceMovie) {
    const fingerprint = sourceMovie?.fingerprint;
    return typeof sourceMovie?.displayName === 'string'
      && sourceMovie.displayName.length >= 1 && sourceMovie.displayName.length <= 512
      && !/[\\/]/.test(sourceMovie.displayName)
      && fingerprint?.fingerprintVersion === 1
      && typeof fingerprint.sourceSampleDigest === 'string' && /^[a-f0-9]{64}$/.test(fingerprint.sourceSampleDigest)
      && typeof fingerprint.streamMetadataDigest === 'string' && /^[a-f0-9]{64}$/.test(fingerprint.streamMetadataDigest)
      && typeof fingerprint.sourceBytes === 'string' && /^(0|[1-9]\d{0,19})$/.test(fingerprint.sourceBytes)
      && typeof fingerprint.sourceDurationUs === 'string' && /^(0|[1-9]\d{0,19})$/.test(fingerprint.sourceDurationUs)
      && typeof fingerprint.signatureProfileVersion === 'string'
      && /^[a-zA-Z0-9._-]{1,100}$/.test(fingerprint.signatureProfileVersion)
      && Number.isSafeInteger(fingerprint.selectedStream) && fingerprint.selectedStream >= 0;
  }

  static #isValidRange(range) {
    const optionalTime = value => value === undefined || SourceInfo.#isCount(value);
    return SourceInfo.#isCount(range?.start) && SourceInfo.#isCount(range.end) && range.end >= range.start
      && optionalTime(range.startTimeUs) && optionalTime(range.endTimeUs);
  }

  static #isValidReferenceFrame(frame) {
    return SourceInfo.#isCount(frame?.frameIndex)
      && typeof frame.frameInfoHash === 'string' && /^[a-f0-9]{16}$/.test(frame.frameInfoHash);
  }

  static #isCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  get movieDisplayName() {
    return this.sourceMovie.displayName;
  }

  get hasRange() {
    return this.range !== null;
  }

  limitedTo(sourceInfoKind) {
    if (sourceInfoKind === 'movie-range') return this;
    if (sourceInfoKind === 'movie-only') return this.hasRange ? SourceInfo.#movieOnly(this.sourceMovie) : this;
    throw new Error('Source info kind is unknown.');
  }

  // A trim keeps the times of the original ends, so a stored time is exact only while the reference
  // frames are the range's two ends.
  exactTimeUsOf(frameIndex) {
    if (!this.hasRange) return undefined;
    const [first, second] = this.referenceFrames;
    const untrimmed = this.referenceFrames.length === 2
      && first.frameIndex === this.range.start && second.frameIndex === this.range.end;
    if (!untrimmed) return undefined;
    if (frameIndex === this.range.start) return this.range.startTimeUs;
    if (frameIndex === this.range.end) return this.range.endTimeUs;
    return undefined;
  }

  // The stored times stay those of the original ends: they only place the movie window, whose margin
  // covers the shift.
  trimmed(startOffset, endOffset) {
    if (!this.hasRange) return this;
    const start = this.range.start + startOffset;
    const end = this.range.end + endOffset;
    if (startOffset < 0 || endOffset > 0 || end < start) throw new Error('A trim must keep at least one frame of the clip.');
    return SourceInfo.#validated(this.sourceMovie, { ...this.range, start, end }, this.referenceFrames);
  }

  toRecord() {
    const sourceMovie = { displayName: this.sourceMovie.displayName, fingerprint: { ...this.sourceMovie.fingerprint } };
    if (!this.hasRange) return { provenanceVersion: 2, sourceMovie };
    return {
      provenanceVersion: 2,
      sourceMovie,
      sourceFrameRange: { ...this.range, endInclusive: true },
      referenceFrames: this.referenceFrames.map(frame => ({ ...frame })),
    };
  }
}

module.exports = { SourceInfo };
