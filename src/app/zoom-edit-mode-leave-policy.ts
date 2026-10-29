import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { IScreenIdentity } from './refine-screen-leave-policy.js';

type ZoomEditModeLeavePolicyOptions = Readonly<{
  activeEdit: Pick<ActiveZoomEdit, 'isActive'>;
  collectionScreenId: string;
}>;

// Zoom edit mode must end, asking first about staged edits, before another screen takes the shared player.
export class ZoomEditModeLeavePolicy {
  constructor(private readonly options: ZoomEditModeLeavePolicyOptions) {}

  canLeave(current: IScreenIdentity): boolean {
    return current.id !== this.options.collectionScreenId || !this.options.activeEdit.isActive;
  }
}
