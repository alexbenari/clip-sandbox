import type { IShortcutDescriptor } from './shortcut-descriptor.js';
import type { ZoomEditJumpSeconds } from './zoom-edit-mode-session.js';

// The keys of Zoom edit mode. The hint line and the keyboard map name keys from here, so they match the bindings.
export const ZOOM_EDIT_MODE_KEYS = Object.freeze({
  markStart: 'Q', markEnd: 'W', jumpToStart: 'A', jumpToEnd: 'S', loop: 'Z', save: 'X',
});

// Top-row digits 1 to 5, in order.
export const ZOOM_EDIT_JUMP_SECONDS: readonly ZoomEditJumpSeconds[] = Object.freeze([1, 2, 5, 7, 10]);

export type ZoomEditModeCommand =
  | Readonly<{ kind: 'toggle-playback' }>
  | Readonly<{ kind: 'step'; direction: -1 | 1 }>
  | Readonly<{ kind: 'jump'; seconds: ZoomEditJumpSeconds }>
  | Readonly<{ kind: 'mark-start' }>
  | Readonly<{ kind: 'mark-end' }>
  | Readonly<{ kind: 'jump-to-start' }>
  | Readonly<{ kind: 'jump-to-end' }>
  | Readonly<{ kind: 'toggle-loop' }>
  | Readonly<{ kind: 'save' }>
  | Readonly<{ kind: 'leave' }>;

const keys = ZOOM_EDIT_MODE_KEYS;
const jumpSeconds = ZOOM_EDIT_JUMP_SECONDS;

export const ZOOM_EDIT_MODE_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Play or pause', group: 'Zoom edit', sequences: [['Space']] },
  { description: 'Step one frame', group: 'Zoom edit', sequences: [['Left'], ['Right']] },
  {
    description: `Jump by ${jumpSeconds.slice(0, -1).join(', ')} or ${jumpSeconds[jumpSeconds.length - 1]} seconds`,
    group: 'Zoom edit',
    sequences: [[`1-${jumpSeconds.length}`]],
  },
  { description: 'Set the start or the end at this frame', group: 'Zoom edit', sequences: [[keys.markStart], [keys.markEnd]] },
  { description: 'Go to the start or the end', group: 'Zoom edit', sequences: [[keys.jumpToStart], [keys.jumpToEnd]] },
  { description: 'Loop the range', group: 'Zoom edit', sequences: [[keys.loop]] },
  { description: 'Save', group: 'Zoom edit', sequences: [[keys.save]] },
  { description: 'Leave Zoom edit mode', group: 'Zoom edit', sequences: [['Escape']] },
]);
