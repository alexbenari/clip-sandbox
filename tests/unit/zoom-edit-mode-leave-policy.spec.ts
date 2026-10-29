import { describe, expect, it } from 'vitest';

import { ActiveZoomEdit } from '../../src/app/active-zoom-edit.js';
import { ZoomEditModeLeavePolicy } from '../../src/app/zoom-edit-mode-leave-policy.js';

function policyWhileEditing() {
  const activeEdit = new ActiveZoomEdit();
  activeEdit.begin();
  return { policy: new ZoomEditModeLeavePolicy({ activeEdit, collectionScreenId: 'collection' }), activeEdit };
}

describe('ZoomEditModeLeavePolicy', () => {
  it('holds the Collection screen while Zoom edit mode is active, so the mode ends before another screen shows', () => {
    const { policy } = policyWhileEditing();

    expect(policy.canLeave({ id: 'collection' })).toBe(false);
  });

  it('lets the Collection screen go once Zoom edit mode has ended', () => {
    const { policy, activeEdit } = policyWhileEditing();

    activeEdit.end();

    expect(policy.canLeave({ id: 'collection' })).toBe(true);
  });

  it('never holds another screen', () => {
    const { policy } = policyWhileEditing();

    expect(policy.canLeave({ id: 'gif-extraction' })).toBe(true);
  });
});
