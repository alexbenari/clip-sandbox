import type { IFramePlaybackControl } from '../contracts/frame-playback-control';
import type { CandidateId, ICandidateSnapshot, ISharedMovieSource } from '../contracts/types';
import { shouldIgnoreKeyboardShortcut } from './keyboard-shortcuts';
import { KeyboardStepController } from './keyboard-step-controller';
import { RangeCaptureModel } from './range-capture-model';
import { RangeCapturePanel } from './range-capture-panel';
import { SharedMovieSourceModel } from './shared-movie-source';

export type CandidateControls = Record<CandidateId, IFramePlaybackControl>;

export class ComparisonHost {
  private readonly rangeCaptureModel = new RangeCaptureModel();

  private readonly sharedMovieSource: SharedMovieSourceModel;

  private readonly candidates: CandidateControls;

  private readonly keyboardStepController = new KeyboardStepController(
    () => this.getActiveCandidate(),
  );

  private activeCandidateId: CandidateId = 'candidate-a';

  private cleanupCallbacks: Array<() => void> = [];

  private rangePanel: RangeCapturePanel | null = null;

  constructor(
    candidates: CandidateControls,
    sharedMovieSource: SharedMovieSourceModel = new SharedMovieSourceModel(),
  ) {
    this.candidates = candidates;
    this.sharedMovieSource = sharedMovieSource;
  }

  mount(root: HTMLElement): void {
    root.innerHTML = `
      <main class="spike-shell">
        <header class="spike-shell__header">
          <div>
            <h1>Frame-First Video Playback Spike</h1>
            <p>Compare two isolated controls against one shared movie source.</p>
          </div>
          <label class="file-picker">
            <span>Load Movie</span>
            <input id="movie-file-input" type="file" accept="video/*" />
          </label>
        </header>
        <section class="spike-shell__controls">
          <div class="segmented-control" id="candidate-selector">
            <button data-candidate-id="candidate-a" class="segmented-control__button segmented-control__button--active">Candidate A</button>
            <button data-candidate-id="candidate-b" class="segmented-control__button">Candidate B</button>
          </div>
        </section>
        <section class="spike-shell__content">
          <div class="spike-shell__comparison">
            <div id="candidate-a-host"></div>
            <div id="candidate-b-host"></div>
          </div>
          <aside id="range-panel-host"></aside>
        </section>
        <footer class="legend">
          <span><kbd>Q</kbd> mark start</span>
          <span><kbd>W</kbd> mark end</span>
          <span><kbd>A</kbd> lock range</span>
          <span><kbd>←</kbd>/<kbd>→</kbd> step active candidate</span>
          <span><kbd>1</kbd>/<kbd>2</kbd> switch active candidate</span>
        </footer>
      </main>
    `;

    const candidateAHost = root.querySelector<HTMLElement>('#candidate-a-host');
    const candidateBHost = root.querySelector<HTMLElement>('#candidate-b-host');
    const rangePanelHost = root.querySelector<HTMLElement>('#range-panel-host');
    const fileInput = root.querySelector<HTMLInputElement>('#movie-file-input');
    const candidateSelector = root.querySelector<HTMLElement>('#candidate-selector');

    if (!candidateAHost || !candidateBHost || !rangePanelHost || !fileInput || !candidateSelector) {
      throw new Error('Comparison host is missing required DOM nodes.');
    }

    this.candidates['candidate-a'].mount(candidateAHost);
    this.candidates['candidate-b'].mount(candidateBHost);

    this.cleanupCallbacks.push(
      this.candidates['candidate-a'].onSnapshotChanged((snapshot) => {
        this.onCandidateSnapshotChanged(snapshot);
      }),
      this.candidates['candidate-b'].onSnapshotChanged((snapshot) => {
        this.onCandidateSnapshotChanged(snapshot);
      }),
    );

    this.rangePanel = new RangeCapturePanel(
      rangePanelHost,
      this.rangeCaptureModel,
      () => this.activeCandidateId,
    );
    this.cleanupCallbacks.push(this.rangePanel.start());

    fileInput.addEventListener('change', async () => {
      const [file] = Array.from(fileInput.files ?? []);
      if (!file) {
        return;
      }

      await this.loadSharedSource(file);
    });

    candidateSelector.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const candidateId = target.dataset.candidateId as CandidateId | undefined;
      if (!candidateId || candidateId === this.activeCandidateId) {
        return;
      }

      await this.setActiveCandidate(candidateId);
      this.renderSelector(candidateSelector);
    });

    const handleKeydown = (event: KeyboardEvent): void => {
      void this.handleKeydown(event, candidateSelector);
    };
    const handleKeyup = (event: KeyboardEvent): void => {
      this.handleKeyup(event);
    };
    const handleWindowBlur = (): void => {
      this.keyboardStepController.stop();
    };
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    window.addEventListener('blur', handleWindowBlur);
    this.cleanupCallbacks.push(() => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('blur', handleWindowBlur);
    });

    void this.candidates[this.activeCandidateId].activate();
  }

  async dispose(): Promise<void> {
    this.keyboardStepController.stop();
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
    await Promise.all(Object.values(this.candidates).map((candidate) => candidate.dispose()));
    this.sharedMovieSource.dispose();
  }

  private async loadSharedSource(file: File): Promise<void> {
    let source: ISharedMovieSource;
    try {
      source = await this.sharedMovieSource.setSource(file);
    } catch (error) {
      for (const candidate of Object.values(this.candidates)) {
        candidate.reportLoadFailure(error);
      }
      return;
    }

    for (const candidate of Object.values(this.candidates)) {
      void this.loadCandidate(candidate, source);
    }
  }

  private async loadCandidate(
    candidate: IFramePlaybackControl,
    source: ISharedMovieSource,
  ): Promise<void> {
    try {
      await candidate.loadMovie(source);

      if (candidate.id === this.activeCandidateId && !candidate.getSnapshot().active) {
        await candidate.activate();
      }
    } catch (error) {
      candidate.reportLoadFailure(error);
    }
  }

  private async setActiveCandidate(nextCandidateId: CandidateId): Promise<void> {
    if (nextCandidateId === this.activeCandidateId) {
      return;
    }

    const previous = this.getActiveCandidate();
    const handoffPosition = previous.getCurrentPosition();
    this.sharedMovieSource.setHandoffPosition(handoffPosition);
    this.activeCandidateId = nextCandidateId;
    void previous.deactivate().catch((error: unknown) => {
      previous.reportLoadFailure(error);
    });
    await this.getActiveCandidate().activate({
      handoffPosition: this.sharedMovieSource.getHandoffPosition(),
    });
    this.rangePanel?.refresh();
  }

  private async handleKeydown(event: KeyboardEvent, candidateSelector: HTMLElement): Promise<void> {
    if (shouldIgnoreKeyboardShortcut(event)) {
      return;
    }

    const activeCandidate = this.getActiveCandidate();
    const currentPosition = activeCandidate.getCurrentPosition();

    switch (event.key.toLowerCase()) {
      case '1':
        event.preventDefault();
        this.keyboardStepController.stop();
        await this.setActiveCandidate('candidate-a');
        this.renderSelector(candidateSelector);
        return;
      case '2':
        event.preventDefault();
        this.keyboardStepController.stop();
        await this.setActiveCandidate('candidate-b');
        this.renderSelector(candidateSelector);
        return;
      case 'q':
        if (currentPosition) {
          event.preventDefault();
          this.rangeCaptureModel.markStart(currentPosition);
        }
        return;
      case 'w':
        if (currentPosition) {
          event.preventDefault();
          this.rangeCaptureModel.markEnd(currentPosition);
        }
        return;
      case 'a':
        event.preventDefault();
        this.rangeCaptureModel.lockRange(this.activeCandidateId);
        return;
      case 'arrowleft':
        event.preventDefault();
        if (currentPosition) {
          this.keyboardStepController.keyDown(-1);
        }
        return;
      case 'arrowright':
        event.preventDefault();
        if (currentPosition) {
          this.keyboardStepController.keyDown(1);
        }
        return;
      default:
        return;
    }
  }

  private handleKeyup(event: KeyboardEvent): void {
    switch (event.key.toLowerCase()) {
      case 'arrowleft':
        this.keyboardStepController.keyUp(-1);
        return;
      case 'arrowright':
        this.keyboardStepController.keyUp(1);
        return;
      default:
        return;
    }
  }

  private getActiveCandidate(): IFramePlaybackControl {
    return this.candidates[this.activeCandidateId];
  }

  private onCandidateSnapshotChanged(snapshot: ICandidateSnapshot): void {
    if (!snapshot.active) {
      return;
    }

    this.sharedMovieSource.setHandoffPosition(snapshot.currentPosition);
  }

  private renderSelector(selectorHost: HTMLElement): void {
    for (const button of Array.from(selectorHost.querySelectorAll<HTMLButtonElement>('button'))) {
      button.classList.toggle(
        'segmented-control__button--active',
        button.dataset.candidateId === this.activeCandidateId,
      );
    }
  }
}
