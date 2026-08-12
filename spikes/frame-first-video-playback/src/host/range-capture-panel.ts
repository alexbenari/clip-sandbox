import type { CandidateId } from '../contracts/types';
import {
  formatTimestampMs,
  type RangeCaptureSnapshot,
  RangeCaptureModel,
} from './range-capture-model';

function renderPosition(label: string, value: { frameIndex: number; timestampMs: number } | null): string {
  if (!value) {
    return `<div class="range-panel__field"><span>${label}</span><strong>--</strong></div>`;
  }

  return `
    <div class="range-panel__field">
      <span>${label}</span>
      <strong>F${value.frameIndex}</strong>
      <small>${formatTimestampMs(value.timestampMs)}</small>
    </div>
  `;
}

export class RangeCapturePanel {
  private lastSnapshot: RangeCaptureSnapshot = {
    draft: {
      start: null,
      end: null,
      error: null,
      lastLockedRangeId: null,
    },
    ranges: [],
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly model: RangeCaptureModel,
    private readonly getActiveCandidateId: () => CandidateId,
  ) {}

  start(): () => void {
    return this.model.subscribe((snapshot) => {
      this.lastSnapshot = snapshot;
      this.render(snapshot);
    });
  }

  refresh(): void {
    this.render(this.lastSnapshot);
  }

  private render(snapshot: RangeCaptureSnapshot): void {
    const rangesMarkup = snapshot.ranges.length
      ? snapshot.ranges
          .map(
            (range) => `
              <li class="range-panel__range">
                <div>
                  <strong>${range.label}</strong>
                  <span>${range.candidateId}</span>
                </div>
                <small>F${range.start.frameIndex} -> F${range.end.frameIndex}</small>
                <small>${formatTimestampMs(range.start.timestampMs)} -> ${formatTimestampMs(
                  range.end.timestampMs,
                )}</small>
              </li>
            `,
          )
          .join('')
      : '<li class="range-panel__empty">No captured ranges yet.</li>';

    this.host.innerHTML = `
      <section class="range-panel">
        <header class="range-panel__header">
          <div>
            <h2>Shared Range Capture</h2>
            <p>Active candidate: ${this.getActiveCandidateId()}</p>
          </div>
          <span class="range-panel__counter">${snapshot.ranges.length} locked</span>
        </header>
        <div class="range-panel__draft ${snapshot.draft.error ? 'range-panel__draft--error' : ''}">
          ${renderPosition('Start', snapshot.draft.start)}
          ${renderPosition('End', snapshot.draft.end)}
        </div>
        <p class="range-panel__error">${snapshot.draft.error ?? ''}</p>
        <ul class="range-panel__ranges">${rangesMarkup}</ul>
      </section>
    `;
  }
}
