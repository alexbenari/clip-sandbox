import type { CandidateSnapshot, FramePosition, PlaybackRate } from '../../contracts/types';
import { formatTimestampMs } from '../../host/range-capture-model';

export interface WebCodecsExamplesPanelCallbacks {
  onPlayPause(): void;
  onStop(): void;
  onStep(delta: number): void;
  onRateChange(rate: PlaybackRate): void;
  onScrubStart(): void;
  onScrubChange(ratio: number): void;
  onScrubEnd(ratio: number): void;
}

const PLAYBACK_RATES: readonly PlaybackRate[] = [0.25, 0.5, 1, 2];

function describePosition(position: FramePosition | null): string {
  if (!position) {
    return 'No frame';
  }

  return `F${position.frameIndex}  ${formatTimestampMs(position.timestampMs)}`;
}

export class WebCodecsExamplesPanel {
  private root: HTMLElement | null = null;

  constructor(private readonly callbacks: WebCodecsExamplesPanelCallbacks) {}

  mount(host: HTMLElement): void {
    this.root = host;
    this.root.innerHTML = `
      <section class="candidate-panel">
        <header class="candidate-panel__header">
          <div>
            <h2>Candidate A</h2>
            <p>webcodecs-examples wrapper</p>
          </div>
          <span data-role="status-pill" class="candidate-pill">idle</span>
        </header>
        <canvas data-role="canvas" class="candidate-panel__canvas" width="960" height="540"></canvas>
        <div class="candidate-controls">
          <div class="candidate-controls__row">
            <button data-action="play-pause">Play</button>
            <button data-action="stop">Stop</button>
            <button data-action="step-back-10">-10</button>
            <button data-action="step-back-1">-1</button>
            <button data-action="step-forward-1">+1</button>
            <button data-action="step-forward-10">+10</button>
          </div>
          <input data-role="scrubber" type="range" min="0" max="1000" value="0" />
          <div data-role="rates" class="candidate-controls__row">
            ${PLAYBACK_RATES.map(
              (rate) =>
                `<button data-action="rate" data-rate="${rate}" ${
                  rate === 1 ? 'class="candidate-controls__rate candidate-controls__rate--active"' : 'class="candidate-controls__rate"'
                }>${rate}x</button>`,
            ).join('')}
          </div>
        </div>
        <div class="candidate-panel__meta">
          <span data-role="position">${describePosition(null)}</span>
          <span data-role="message">Waiting for movie.</span>
        </div>
      </section>
    `;

    const playPauseButton = this.queryButton('button[data-action="play-pause"]');
    const stopButton = this.queryButton('button[data-action="stop"]');
    const stepBack10Button = this.queryButton('button[data-action="step-back-10"]');
    const stepBack1Button = this.queryButton('button[data-action="step-back-1"]');
    const stepForward1Button = this.queryButton('button[data-action="step-forward-1"]');
    const stepForward10Button = this.queryButton('button[data-action="step-forward-10"]');
    const scrubber = this.queryInput('[data-role="scrubber"]');
    const rateButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('button[data-action="rate"]'),
    );

    playPauseButton.addEventListener('click', () => this.callbacks.onPlayPause());
    stopButton.addEventListener('click', () => this.callbacks.onStop());
    stepBack10Button.addEventListener('click', () => this.callbacks.onStep(-10));
    stepBack1Button.addEventListener('click', () => this.callbacks.onStep(-1));
    stepForward1Button.addEventListener('click', () => this.callbacks.onStep(1));
    stepForward10Button.addEventListener('click', () => this.callbacks.onStep(10));

    scrubber.addEventListener('pointerdown', () => {
      this.callbacks.onScrubStart();
    });
    scrubber.addEventListener('input', () => {
      this.callbacks.onScrubChange(Number(scrubber.value) / 1000);
    });
    scrubber.addEventListener('change', () => {
      this.callbacks.onScrubEnd(Number(scrubber.value) / 1000);
    });

    for (const button of rateButtons) {
      button.addEventListener('click', () => {
        const rate = Number(button.dataset.rate) as PlaybackRate;
        this.callbacks.onRateChange(rate);
      });
    }
  }

  getCanvas(): HTMLCanvasElement {
    const canvas = this.root?.querySelector<HTMLCanvasElement>('[data-role="canvas"]');
    if (!canvas) {
      throw new Error('Candidate A canvas is not mounted.');
    }
    return canvas;
  }

  update(snapshot: CandidateSnapshot): void {
    if (!this.root) {
      return;
    }

    const statusPill = this.root.querySelector<HTMLElement>('[data-role="status-pill"]');
    const playPauseButton = this.root.querySelector<HTMLButtonElement>('button[data-action="play-pause"]');
    const scrubber = this.root.querySelector<HTMLInputElement>('[data-role="scrubber"]');
    const position = this.root.querySelector<HTMLElement>('[data-role="position"]');
    const message = this.root.querySelector<HTMLElement>('[data-role="message"]');
    const rateButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('button[data-action="rate"]'),
    );
    const stepButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('button[data-action^="step-"]'),
    );

    if (!statusPill || !playPauseButton || !scrubber || !position || !message) {
      return;
    }

    this.root
      .querySelector<HTMLElement>('.candidate-panel')
      ?.classList.toggle('candidate-panel--active', snapshot.active);
    this.root
      .querySelector<HTMLElement>('.candidate-panel')
      ?.classList.toggle('candidate-panel--error', snapshot.status === 'error');
    statusPill.textContent = snapshot.status;
    playPauseButton.textContent = snapshot.status === 'playing' ? 'Pause' : 'Play';
    position.textContent = describePosition(snapshot.currentPosition);
    message.textContent = snapshot.message ?? '';

    if (snapshot.currentPosition && snapshot.frameCount && snapshot.frameCount > 1) {
      scrubber.value = Math.round(
        (snapshot.currentPosition.frameIndex / (snapshot.frameCount - 1)) * 1000,
      ).toString();
    } else {
      scrubber.value = '0';
    }

    for (const button of rateButtons) {
      const rate = Number(button.dataset.rate);
      button.classList.toggle(
        'candidate-controls__rate--active',
        rate === snapshot.playbackRate,
      );
      button.disabled = true;
      button.title = 'Candidate A does not expose playback-rate control through its public API.';
    }

    for (const button of stepButtons) {
      const action = button.dataset.action ?? '';
      const stepSize = action.includes('10') ? 10 : 1;
      button.classList.toggle(
        'candidate-controls__step--active',
        stepSize === snapshot.selectedStepSize,
      );
    }
  }

  private queryButton(selector: string): HTMLButtonElement {
    const button = this.root?.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      throw new Error(`Missing button: ${selector}`);
    }
    return button;
  }

  private queryInput(selector: string): HTMLInputElement {
    const input = this.root?.querySelector<HTMLInputElement>(selector);
    if (!input) {
      throw new Error(`Missing input: ${selector}`);
    }
    return input;
  }
}
