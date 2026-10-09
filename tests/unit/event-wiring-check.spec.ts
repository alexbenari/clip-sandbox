import { describe, expect, it } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import { EventWiringCheck } from '../../src/app/event-wiring-check.js';

type ToolbarEvents = {
  saveRequested: void;
  browseRequested: void;
};

describe('EventWiringCheck', () => {
  it('passes when every required event has a subscriber', () => {
    const toolbar = new EventSource<ToolbarEvents>();
    toolbar.on('saveRequested', () => undefined);
    toolbar.on('browseRequested', () => undefined);
    const check = new EventWiringCheck();
    check.require('toolbar', toolbar, ['saveRequested', 'browseRequested']);

    expect(() => check.assertComplete()).not.toThrow();
  });

  it('names every required event that has no subscriber', () => {
    const toolbar = new EventSource<ToolbarEvents>();
    toolbar.on('saveRequested', () => undefined);
    const grid = new EventSource<{ orderChanged: readonly string[] }>();
    const check = new EventWiringCheck();
    check.require('toolbar', toolbar, ['saveRequested', 'browseRequested']);
    check.require('grid', grid, ['orderChanged']);

    expect(() => check.assertComplete()).toThrow(
      'Application events without a subscriber: toolbar.browseRequested, grid.orderChanged.');
  });

  it('reports an event whose only subscriber has unsubscribed', () => {
    const toolbar = new EventSource<ToolbarEvents>();
    const unsubscribe = toolbar.on('saveRequested', () => undefined);
    const check = new EventWiringCheck();
    check.require('toolbar', toolbar, ['saveRequested']);

    unsubscribe();

    expect(() => check.assertComplete()).toThrow('toolbar.saveRequested');
  });
});
