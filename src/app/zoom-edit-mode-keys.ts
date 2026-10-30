import type { StepDirection } from './held-step-repeat.js';
import type { IShortcutDescriptor } from './shortcut-descriptor.js';
import type { ZoomEditJumpSeconds } from './zoom-edit-mode-session.js';
import type { ZoomEditEntry } from './zoom-edit-mode-workflow.js';

// The keys of Zoom edit mode and of entering it from Zoom. The hint line and the keyboard map name keys from
// here, so they match the bindings.
export const ZOOM_EDIT_MODE_KEYS = Object.freeze({
  markStart: 'Q', markEnd: 'W', jumpToStart: 'A', jumpToEnd: 'S', loop: 'Z', loopify: 'L', save: 'X',
});

// The keys that enter the mode from Zoom, with that edit staged.
export const ZOOM_EDIT_ENTRY_KEYS: Readonly<Record<ZoomEditEntry, string>> = Object.freeze({
  refine: 'R', loopify: ZOOM_EDIT_MODE_KEYS.loopify,
});

// Top-row digits 1 to 5, in order.
export const ZOOM_EDIT_JUMP_SECONDS: readonly ZoomEditJumpSeconds[] = Object.freeze([1, 2, 5, 7, 10]);

export type ZoomEditModeCommand =
  | Readonly<{ kind: 'toggle-playback' }>
  | Readonly<{ kind: 'press-step'; direction: StepDirection }>
  | Readonly<{ kind: 'release-step'; direction: StepDirection }>
  | Readonly<{ kind: 'jump'; seconds: ZoomEditJumpSeconds }>
  | Readonly<{ kind: 'mark-start' }>
  | Readonly<{ kind: 'mark-end' }>
  | Readonly<{ kind: 'jump-to-start' }>
  | Readonly<{ kind: 'jump-to-end' }>
  | Readonly<{ kind: 'toggle-loop' }>
  | Readonly<{ kind: 'toggle-loopify' }>
  | Readonly<{ kind: 'save' }>
  | Readonly<{ kind: 'leave' }>;

const keys = ZOOM_EDIT_MODE_KEYS;
const jumpSeconds = ZOOM_EDIT_JUMP_SECONDS;

export const ZOOM_EDIT_ENTRY_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Refine the clip in Zoom edit mode', group: 'Zoom', sequences: [[ZOOM_EDIT_ENTRY_KEYS.refine]] },
  { description: 'Loopify the clip in Zoom edit mode', group: 'Zoom', sequences: [[ZOOM_EDIT_ENTRY_KEYS.loopify]] },
]);

export const ZOOM_EDIT_MODE_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Play or pause', group: 'Zoom edit', sequences: [['Space']] },
  { description: 'Step one frame; hold to accelerate', group: 'Zoom edit', sequences: [['Left'], ['Right']] },
  {
    description: `Jump by ${jumpSeconds.slice(0, -1).join(', ')} or ${jumpSeconds[jumpSeconds.length - 1]} seconds`,
    group: 'Zoom edit',
    sequences: [[`1-${jumpSeconds.length}`]],
  },
  { description: 'Set the start or the end at this frame', group: 'Zoom edit', sequences: [[keys.markStart], [keys.markEnd]] },
  { description: 'Go to the start or the end', group: 'Zoom edit', sequences: [[keys.jumpToStart], [keys.jumpToEnd]] },
  { description: 'Loop the range', group: 'Zoom edit', sequences: [[keys.loop]] },
  { description: 'Stage or drop Loopify', group: 'Zoom edit', sequences: [[keys.loopify]] },
  { description: 'Save', group: 'Zoom edit', sequences: [[keys.save]] },
  { description: 'Leave Zoom edit mode', group: 'Zoom edit', sequences: [['Escape']] },
]);
