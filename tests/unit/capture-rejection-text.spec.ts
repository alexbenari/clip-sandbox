import { describe, expect, it } from 'vitest';

import { CaptureRejectionText } from '../../src/app/capture-rejection-text.js';
import { GIF_CAPTURE_KEYS } from '../../src/ui/gif-workflow-keyboard.js';

describe('CaptureRejectionText', () => {
  it('names the key that is bound to starting a new range', () => {
    expect(new CaptureRejectionText(GIF_CAPTURE_KEYS.markStart).textFor('locked-range-needs-new-start'))
      .toBe(`Press ${GIF_CAPTURE_KEYS.markStart} to begin a new range.`);
  });

  it('gives advice without a key when none is known', () => {
    expect(new CaptureRejectionText().textFor('locked-range-needs-new-start')).toBe('Mark a new start to begin another range.');
    expect(new CaptureRejectionText().textFor('endpoints-missing')).toBe('Mark a start and end before locking.');
  });
});
