import { ClipSource } from './clip-source.js';
import type { SourceMovie } from './source-movie.js';

export type ClipMetadata = {
  durationSec?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
};

type ClipParams = ClipMetadata & {
  id: string;
  source: ClipSource;
};

export class Clip {
  #id: string;
  #source: ClipSource;
  #durationSec: number | null;
  #videoWidth: number | null;
  #videoHeight: number | null;
  #metadataFailed: boolean;
  #sourceMovie: SourceMovie | null = null;

  constructor({ id, source, durationSec = null, videoWidth = null, videoHeight = null }: ClipParams) {
    if (!id) throw new Error('Clip id is required.');
    this.#id = id;
    this.#source = Clip.#requiredSource(source);
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#source.name;
  }

  get source() {
    return this.#source;
  }

  get mediaSource() {
    return this.#source.mediaSource;
  }

  get videoWidth() {
    return this.#videoWidth;
  }

  get videoHeight() {
    return this.#videoHeight;
  }

  get durationSec() {
    return this.#durationSec;
  }

  get metadataFailed() {
    return this.#metadataFailed;
  }

  get sourceMovie(): SourceMovie | null {
    return this.#sourceMovie;
  }

  recordSourceMovie(movie: SourceMovie | null): void {
    this.#sourceMovie = movie;
  }

  hasUsableDimensions() {
    const videoWidth = this.#videoWidth;
    const videoHeight = this.#videoHeight;
    return typeof videoWidth === 'number' && Number.isFinite(videoWidth) && videoWidth > 0
      && typeof videoHeight === 'number' && Number.isFinite(videoHeight) && videoHeight > 0;
  }

  setDuration(durationSec: number | null | undefined): void {
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
  }

  setVideoMetadata({ durationSec = this.#durationSec, videoWidth = this.#videoWidth, videoHeight = this.#videoHeight }: ClipMetadata = {}): void {
    this.setDuration(durationSec);
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
  }

  markMetadataFailed(): void {
    this.#metadataFailed = true;
  }

  replaceSource(source: ClipSource): void {
    this.#source = Clip.#requiredSource(source);
  }

  static #requiredSource(source: ClipSource): ClipSource {
    if (!(source instanceof ClipSource)) throw new Error('Clip source is required.');
    return source;
  }

  static #usableDimension(value: number | null | undefined): number | null {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0 ? dimension : null;
  }
}

