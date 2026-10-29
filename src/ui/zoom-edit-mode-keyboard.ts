import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { ZOOM_EDIT_JUMP_SECONDS, ZOOM_EDIT_MODE_KEYS, type ZoomEditModeCommand } from '../app/zoom-edit-mode-keys.js';

export interface IZoomEditModeKeyboardEvents {
  commandRequested: ZoomEditModeCommand;
}

const JUMPS_BY_CODE: Readonly<Record<string, ZoomEditModeCommand>> = Object.freeze(Object.fromEntries(
  ZOOM_EDIT_JUMP_SECONDS.map((seconds, index): [string, ZoomEditModeCommand] => [`Digit${index + 1}`, { kind: 'jump', seconds }]),
));

const keys = ZOOM_EDIT_MODE_KEYS;

const COMMANDS_BY_KEY: Readonly<Record<string, ZoomEditModeCommand>> = Object.freeze({
  ' ': { kind: 'toggle-playback' },
  'arrowleft': { kind: 'step', direction: -1 },
  'arrowright': { kind: 'step', direction: 1 },
  [keys.markStart.toLowerCase()]: { kind: 'mark-start' },
  [keys.markEnd.toLowerCase()]: { kind: 'mark-end' },
  [keys.jumpToStart.toLowerCase()]: { kind: 'jump-to-start' },
  [keys.jumpToEnd.toLowerCase()]: { kind: 'jump-to-end' },
  [keys.loop.toLowerCase()]: { kind: 'toggle-loop' },
  [keys.save.toLowerCase()]: { kind: 'save' },
  'escape': { kind: 'leave' },
});

export class ZoomEditModeKeyboard implements IEventSource<IZoomEditModeKeyboardEvents> {
  private readonly events = new EventSource<IZoomEditModeKeyboardEvents>();

  on<TName extends keyof IZoomEditModeKeyboardEvents>(name: TName, handler: EventHandler<IZoomEditModeKeyboardEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    const command = this.commandFor(event);
    if (!command) return false;
    event.preventDefault();
    // A key held down requests its command once.
    if (!event.repeat) this.events.emit('commandRequested', command);
    return true;
  }

  private commandFor(event: KeyboardEvent): ZoomEditModeCommand | null {
    const jump = event.shiftKey ? undefined : JUMPS_BY_CODE[event.code];
    return jump ?? COMMANDS_BY_KEY[event.key.toLowerCase()] ?? null;
  }
}
