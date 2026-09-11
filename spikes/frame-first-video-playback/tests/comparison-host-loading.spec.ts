import { describe, expect, it } from 'vitest';

import type { IFramePlaybackControl } from '../src/contracts/frame-playback-control';
import type {
  CandidateId,
  ICandidateSnapshot,
  IFramePosition,
  PlaybackRate,
  ISharedMovieSource,
} from '../src/contracts/types';
import { ComparisonHost, type CandidateControls } from '../src/host/comparison-host';
import { SharedMovieSourceModel } from '../src/host/shared-movie-source';

class FakeCandidate implements IFramePlaybackControl {
  readonly label: string;

  loadCalls = 0;

  activateCalls = 0;

  loadError: unknown = null;

  active = false;

  constructor(
    readonly id: CandidateId,
    private readonly loadResult: () => Promise<void>,
    private readonly deactivateResult: () => Promise<void> = async () => {},
  ) {
    this.label = id;
  }

  mount(): void {}

  async loadMovie(): Promise<void> {
    this.loadCalls += 1;
    await this.loadResult();
  }

  async activate(): Promise<void> {
    this.activateCalls += 1;
    this.active = true;
  }

  async deactivate(): Promise<void> {
    await this.deactivateResult();
    this.active = false;
  }

  async play(): Promise<void> {}

  async pause(): Promise<void> {}

  async stop(): Promise<IFramePosition | null> {
    return null;
  }

  async setPlaybackRate(_rate: PlaybackRate): Promise<void> {}

  async stepFrames(_delta: number): Promise<IFramePosition | null> {
    return null;
  }

  async seekToFrame(_frameIndex: number): Promise<IFramePosition | null> {
    return null;
  }

  async scrubToRatio(_ratio: number): Promise<IFramePosition | null> {
    return null;
  }

  getSelectedStepSize(): 1 | 10 {
    return 1;
  }

  getCurrentPosition(): IFramePosition | null {
    return null;
  }

  getSnapshot(): ICandidateSnapshot {
    return {
      candidateId: this.id,
      status: 'idle',
      playbackRate: 1,
      selectedStepSize: 1,
      currentPosition: null,
      frameCount: null,
      durationMs: null,
      message: null,
      active: this.active,
    };
  }

  onSnapshotChanged(): () => void {
    return () => {};
  }

  reportLoadFailure(error: unknown): void {
    this.loadError = error;
  }

  async dispose(): Promise<void> {}
}

interface IComparisonHostInternals {
  candidates: Record<CandidateId, IFramePlaybackControl>;
  sharedMovieSource: {
    setSource(file: File): Promise<ISharedMovieSource>;
    setHandoffPosition(position: IFramePosition | null): void;
    getHandoffPosition(): IFramePosition | null;
    getSource(): ISharedMovieSource | null;
  };
  activeCandidateId: CandidateId;
  loadSharedSource(file: File): Promise<void>;
  setActiveCandidate(candidateId: CandidateId): Promise<void>;
}

class FakeSharedMovieSourceModel extends SharedMovieSourceModel {
  constructor(
    private readonly source: ISharedMovieSource,
    private readonly sourceError: unknown = null,
  ) {
    super();
  }

  override async setSource(_file: File): Promise<ISharedMovieSource> {
    if (this.sourceError) {
      throw this.sourceError;
    }

    return this.source;
  }
}

function createSharedMovieSource(): ISharedMovieSource {
  return {
    file: {} as File,
    label: 'sample.mp4',
    objectUrl: 'blob:sample',
    size: 1,
    lastModified: 0,
    frameIndex: {
      frames: [],
      frameCount: 0,
      durationMs: 0,
      codedWidth: 0,
      codedHeight: 0,
      displayWidth: 0,
      displayHeight: 0,
      codec: null,
    },
  };
}

function prepareHost(
  candidateA: FakeCandidate,
  candidateB: FakeCandidate,
  sharedMovieSource: SharedMovieSourceModel = new FakeSharedMovieSourceModel(createSharedMovieSource()),
): IComparisonHostInternals {
  const candidates: CandidateControls = {
    'candidate-a': candidateA,
    'candidate-b': candidateB,
  };
  return new ComparisonHost(candidates, sharedMovieSource) as unknown as IComparisonHostInternals;
}

describe('ComparisonHost movie loading', () => {
  it('reports shared source errors to both candidate panels', async () => {
    const loadError = new Error('Unsupported input format: AVI.');
    const candidateA = new FakeCandidate('candidate-a', async () => {});
    const candidateB = new FakeCandidate('candidate-b', async () => {});
    const host = prepareHost(
      candidateA,
      candidateB,
      new FakeSharedMovieSourceModel(createSharedMovieSource(), loadError),
    );

    await expect(host.loadSharedSource({} as File)).resolves.toBeUndefined();

    expect(candidateA.loadError).toBe(loadError);
    expect(candidateB.loadError).toBe(loadError);
    expect(candidateA.loadCalls).toBe(0);
    expect(candidateB.loadCalls).toBe(0);
  });

  it('keeps Candidate B usable and reports Candidate A load errors independently', async () => {
    const loadError = new Error('Candidate A cannot read this movie.');
    const candidateA = new FakeCandidate('candidate-a', async () => {
      throw loadError;
    });
    const candidateB = new FakeCandidate('candidate-b', async () => {});
    const host = prepareHost(candidateA, candidateB);

    await expect(host.loadSharedSource({} as File)).resolves.toBeUndefined();
    await Promise.resolve();
    await host.setActiveCandidate('candidate-b');

    expect(candidateA.loadError).toBe(loadError);
    expect(candidateB.loadCalls).toBe(1);
    expect(candidateB.activateCalls).toBeGreaterThan(0);
    expect(host.activeCandidateId).toBe('candidate-b');
  });

  it('switches to Candidate B without awaiting a stuck Candidate A lifecycle', async () => {
    const candidateA = new FakeCandidate(
      'candidate-a',
      () => new Promise<void>(() => {}),
      () => new Promise<void>(() => {}),
    );
    const candidateB = new FakeCandidate('candidate-b', async () => {});
    const host = prepareHost(candidateA, candidateB);

    void host.loadSharedSource({} as File);
    await Promise.resolve();
    await expect(host.setActiveCandidate('candidate-b')).resolves.toBeUndefined();

    expect(candidateB.activateCalls).toBe(1);
    expect(host.activeCandidateId).toBe('candidate-b');
  });
});
