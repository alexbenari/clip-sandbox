import type { IEventSubscriberCount } from './event-source.js';

type RequiredEvent = Readonly<{ sourceLabel: string; source: IEventSubscriberCount<never>; eventName: PropertyKey }>;

export class EventWiringCheck {
  readonly #required: RequiredEvent[] = [];

  require<TEvents>(sourceLabel: string, source: IEventSubscriberCount<TEvents>, eventNames: readonly (keyof TEvents)[]): void {
    for (const eventName of eventNames) {
      this.#required.push({ sourceLabel, source: source as IEventSubscriberCount<never>, eventName });
    }
  }

  assertComplete(): void {
    const unhandled = this.#required
      .filter(({ source, eventName }) => source.subscriberCount(eventName as never) === 0)
      .map(({ sourceLabel, eventName }) => `${sourceLabel}.${String(eventName)}`);
    if (unhandled.length > 0) {
      throw new Error(`Application events without a subscriber: ${unhandled.join(', ')}.`);
    }
  }
}
