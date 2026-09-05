export interface KeyboardCommandTarget {
  togglePlayback(): void;
  markStart(): void;
  markEnd(): void;
  toggleRangeLock(): void;
  pressStep(direction: -1 | 1): void;
  releaseStep(direction: -1 | 1): void;
}

export class KeyboardController {
  constructor(private readonly target: KeyboardCommandTarget) {}

  handleKeyDown(event: KeyboardEvent): void {
    if (isEditable(event.target)) return;
    const command = keyCommand(event.key);
    if (!command) return;
    event.preventDefault();
    if (command.type === 'step') {
      if (!event.repeat) this.target.pressStep(command.direction);
      return;
    }
    if (event.repeat) return;
    this.target[command.type]();
  }

  handleKeyUp(event: KeyboardEvent): void {
    const command = keyCommand(event.key);
    if (command?.type !== 'step') return;
    event.preventDefault();
    this.target.releaseStep(command.direction);
  }
}

type Command =
  | { readonly type: 'togglePlayback' | 'markStart' | 'markEnd' | 'toggleRangeLock' }
  | { readonly type: 'step'; readonly direction: -1 | 1 };

function keyCommand(key: string): Command | null {
  switch (key.toLowerCase()) {
    case ' ': return { type: 'togglePlayback' };
    case 'q': return { type: 'markStart' };
    case 'w': return { type: 'markEnd' };
    case 'a': return { type: 'toggleRangeLock' };
    case 'arrowleft': return { type: 'step', direction: -1 };
    case 'arrowright': return { type: 'step', direction: 1 };
    default: return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string; type?: string; isContentEditable?: boolean };
  if (element.tagName === 'INPUT' && element.type?.toLowerCase() === 'range') return false;
  return element.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? '');
}
