import type { IPreparedReviewMetadata } from './prepared-review.js';

export type FrameReviewPhase =
  | 'opening'
  | 'playback-ready'
  | 'inspecting'
  | 'cache-validation'
  | 'normalizing'
  | 'indexing'
  | 'proxy-encoding'
  | 'proxy-indexing'
  | 'validating'
  | 'exact-ready'
  | 'failed'
  | 'closed';

export interface IFrameReviewState {
  readonly phase: FrameReviewPhase;
  readonly sourceGeneration: number;
  readonly captureEnabled: boolean;
  readonly playbackDurationUs: bigint | null;
  readonly progressPercent: number | null;
  readonly message: string | null;
  readonly preparedReview: IPreparedReviewMetadata | null;
}

export class FrameReviewState {
  static create(
    phase: FrameReviewPhase,
    sourceGeneration: number,
    details: Partial<Omit<IFrameReviewState, 'phase' | 'sourceGeneration' | 'captureEnabled'>> = {},
  ): IFrameReviewState {
    if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0) {
      throw new Error('Source generation must be a non-negative safe integer.');
    }
    const progressPercent = details.progressPercent ?? null;
    if (progressPercent !== null && (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100)) {
      throw new Error('Preparation progress must be between 0 and 100.');
    }
    const playbackDurationUs = details.playbackDurationUs ?? null;
    if (playbackDurationUs !== null && (typeof playbackDurationUs !== 'bigint' || playbackDurationUs < 0n)) {
      throw new Error('Playback duration must be a non-negative bigint.');
    }
    return Object.freeze({
      phase,
      sourceGeneration,
      captureEnabled: phase === 'exact-ready',
      playbackDurationUs,
      progressPercent,
      message: details.message ?? null,
      preparedReview: details.preparedReview ?? null,
    });
  }
}
