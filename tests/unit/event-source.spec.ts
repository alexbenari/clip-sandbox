import { describe, expect, it } from 'vitest';

import { EventSource, type IEventSource } from '../../src/app/event-source.js';

type ToolbarEvents = {
  saveRequested: void;
  orderChanged: readonly string[];
};

type SaveRequests = {
  saveRequested: void;
};

describe('EventSource', () => {
  it('delivers each emitted payload to every subscriber in subscription order', () => {
    const events = new EventSource<ToolbarEvents>();
    const received: string[] = [];
    events.on('orderChanged', ids => received.push(`first:${ids.join(',')}`));
    events.on('orderChanged', ids => received.push(`second:${ids.join(',')}`));

    events.emit('orderChanged', ['clip_2', 'clip_1']);

    expect(received).toEqual(['first:clip_2,clip_1', 'second:clip_2,clip_1']);
  });

  it('emits an event without a payload when its payload type is void', () => {
    const events = new EventSource<ToolbarEvents>();
    let saves = 0;
    events.on('saveRequested', () => { saves += 1; });

    events.emit('saveRequested');

    expect(saves).toBe(1);
  });

  it('stops delivering to a subscription after it unsubscribes', () => {
    const events = new EventSource<ToolbarEvents>();
    let saves = 0;
    const unsubscribe = events.on('saveRequested', () => { saves += 1; });

    unsubscribe();
    events.emit('saveRequested');

    expect(saves).toBe(0);
    expect(events.subscriberCount('saveRequested')).toBe(0);
  });

  it('counts subscriptions per event name', () => {
    const events = new EventSource<ToolbarEvents>();
    events.on('saveRequested', () => undefined);
    events.on('saveRequested', () => undefined);

    expect(events.subscriberCount('saveRequested')).toBe(2);
    expect(events.subscriberCount('orderChanged')).toBe(0);
  });

  it('runs later subscribers after one throws, then rethrows that error', () => {
    const events = new EventSource<ToolbarEvents>();
    const failure = new Error('save handler failed');
    let laterSubscriberRan = false;
    events.on('saveRequested', () => { throw failure; });
    events.on('saveRequested', () => { laterSubscriberRan = true; });

    expect(() => events.emit('saveRequested')).toThrow(failure);
    expect(laterSubscriberRan).toBe(true);
  });

  it('reports every failing subscriber together when several throw', () => {
    const events = new EventSource<ToolbarEvents>();
    events.on('saveRequested', () => { throw new Error('first failure'); });
    events.on('saveRequested', () => { throw new Error('second failure'); });

    let thrown: unknown;
    try { events.emit('saveRequested'); } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors.map(error => (error as Error).message)).toEqual(['first failure', 'second failure']);
  });

  it('can be used wherever a narrower event map is expected', () => {
    const events = new EventSource<ToolbarEvents>();
    const saveRequests: IEventSource<SaveRequests> = events;
    let saves = 0;
    saveRequests.on('saveRequested', () => { saves += 1; });
    // @ts-expect-error A narrower map does not expose events it does not declare.
    saveRequests.on('orderChanged', () => undefined);

    events.emit('saveRequested');

    expect(saves).toBe(1);
  });
});
