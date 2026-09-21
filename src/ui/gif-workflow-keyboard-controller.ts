import type { AdjacentDirection } from '../frame-review/adjacent-step-scheduler.js';

export interface IGifWorkflowPlayerCommands {
  togglePlayback(): void;
  pressStep(direction: AdjacentDirection): void;
  releaseStep(direction?: AdjacentDirection): void;
}

export interface IGifWorkflowCaptureCommands {
  markStart(): void;
  markEnd(): void;
  lockRange(): void;
  extractCurrent?(): void;
  canExtractCurrent?(): boolean;
}

export interface IGifWorkflowKeyboardTarget {
  readonly player: IGifWorkflowPlayerCommands;
  readonly capture?: IGifWorkflowCaptureCommands;
}

export class GifWorkflowKeyboardController {
  private target: IGifWorkflowKeyboardTarget | null = null;
  private readonly heldDirections = new Set<AdjacentDirection>();

  activate(target: IGifWorkflowKeyboardTarget): void {
    if (this.target !== target) this.releaseHeldDirections();
    this.target = target;
  }

  deactivate(): void {
    this.releaseHeldDirections();
    this.target = null;
  }

  releaseHeldSteps(): void {
    this.releaseHeldDirections();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.target || event.altKey || event.ctrlKey || event.metaKey || this.isEditable(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowleft' || key === 'arrowright') {
      if (event.repeat) return;
      const direction = key === 'arrowleft' ? -1 : 1;
      this.heldDirections.add(direction);
      this.target.player.pressStep(direction);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const command = this.commandForKey(key);
    if (!command) return;
    command();
    event.preventDefault();
  }

  handleKeyUp(event: KeyboardEvent): void {
    if (!this.target) return;
    const key = event.key.toLowerCase();
    if (key !== 'arrowleft' && key !== 'arrowright') return;
    const direction = key === 'arrowleft' ? -1 : 1;
    if (!this.heldDirections.delete(direction)) return;
    this.target.player.releaseStep(direction);
    event.preventDefault();
  }

  private commandForKey(key: string): (() => void) | null {
    if (!this.target) return null;
    if (key === ' ') return () => this.target?.player.togglePlayback();
    if (key === 'q' && this.target.capture) return () => this.target?.capture?.markStart();
    if (key === 'w' && this.target.capture) return () => this.target?.capture?.markEnd();
    if (key === 'a' && this.target.capture) return () => this.target?.capture?.lockRange();
    if (key === 'e' && this.target.capture?.extractCurrent
      && this.target.capture.canExtractCurrent?.() === true) {
      return () => this.target?.capture?.extractCurrent?.();
    }
    return null;
  }

  private releaseHeldDirections(): void {
    const player = this.target?.player;
    if (player) {
      for (const direction of this.heldDirections) player.releaseStep(direction);
    }
    this.heldDirections.clear();
  }

  private isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const input = target.closest('input');
    if (input instanceof HTMLInputElement && input.type === 'range') return false;
    return target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]') !== null;
  }
}
