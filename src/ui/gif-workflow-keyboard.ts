import type { AdjacentDirection } from '../frame-review/adjacent-step-scheduler.js';

// The capture keys of both GIF screens. Shortcut lists and messages name keys from here, so they always match the bindings.
export const GIF_CAPTURE_KEYS = Object.freeze({
  markStart: 'Q', markEnd: 'W', jumpStart: 'A', jumpEnd: 'S', loop: 'Z', lock: 'X', extract: 'E',
});

const boundTo = (key: string, binding: string): boolean => key === binding.toLowerCase();

export interface IGifWorkflowPlayerCommands {
  toggleMovieFullScreen(): void;
  exitMovieFullScreen(): Promise<void>;
  isMovieFullScreen(): boolean;
  togglePlayback(): void;
  pressStep(direction: AdjacentDirection): void;
  releaseStep(direction?: AdjacentDirection): void;
  jumpBySeconds(seconds: number): void;
}

export interface IGifWorkflowCaptureCommands {
  markStart(): void;
  markEnd(): void;
  jumpStart(): void;
  jumpEnd(): void;
  startLoop(): void;
  lockRange(): void;
  canMark?(): boolean;
  canJump?(): boolean;
  canLoop?(): boolean;
  canLock?(): boolean;
  extractCurrent?(): void;
  canExtractCurrent?(): boolean;
}

export interface IGifWorkflowKeyboardTarget {
  readonly player: IGifWorkflowPlayerCommands;
  readonly capture?: IGifWorkflowCaptureCommands;
}

export class GifWorkflowKeyboard {
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
    if (!this.target || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && this.target.player.isMovieFullScreen()) {
      void this.target.player.exitMovieFullScreen();
      event.preventDefault();
      return;
    }
    if (key === 'f' && !event.repeat && !this.isTextEditable(event.target)) {
      this.target.player.toggleMovieFullScreen();
      event.preventDefault();
      return;
    }
    if (this.isEditable(event.target)) return;
    if (key === 'e' && this.target.player.isMovieFullScreen()) {
      event.preventDefault();
      return;
    }
    if (key === 'arrowleft' || key === 'arrowright') {
      if (event.repeat) return;
      const direction = key === 'arrowleft' ? -1 : 1;
      this.heldDirections.add(direction);
      this.target.player.pressStep(direction);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const jumpSeconds = this.jumpSecondsForCode(event.code);
    if (jumpSeconds !== null && !event.shiftKey) {
      this.target.player.jumpBySeconds(jumpSeconds);
      event.preventDefault();
      return;
    }
    const command = this.commandForKey(key);
    if (!command) return;
    command();
    event.preventDefault();
  }

  private jumpSecondsForCode(code: string): number | null {
    const values: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 5, Digit4: 7, Digit5: 10 };
    return values[code] ?? null;
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
    if (boundTo(key, GIF_CAPTURE_KEYS.markStart) && this.target.capture && this.target.capture.canMark?.() !== false) return () => this.target?.capture?.markStart();
    if (boundTo(key, GIF_CAPTURE_KEYS.markEnd) && this.target.capture && this.target.capture.canMark?.() !== false) return () => this.target?.capture?.markEnd();
    if (boundTo(key, GIF_CAPTURE_KEYS.jumpStart) && this.target.capture?.canJump?.() === true) return () => this.target?.capture?.jumpStart();
    if (boundTo(key, GIF_CAPTURE_KEYS.jumpEnd) && this.target.capture?.canJump?.() === true) return () => this.target?.capture?.jumpEnd();
    if (boundTo(key, GIF_CAPTURE_KEYS.loop) && this.target.capture?.canLoop?.() === true) return () => this.target?.capture?.startLoop();
    if (boundTo(key, GIF_CAPTURE_KEYS.lock) && this.target.capture?.canLock?.() === true) return () => this.target?.capture?.lockRange();
    if (boundTo(key, GIF_CAPTURE_KEYS.extract) && this.target.capture?.extractCurrent
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

  private isTextEditable(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const input = target.closest('input');
    if (input instanceof HTMLInputElement && input.type !== 'range') return true;
    return target.closest('textarea, [contenteditable], [contenteditable="true"]') !== null;
  }
}
