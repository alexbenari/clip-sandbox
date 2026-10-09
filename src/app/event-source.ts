export type EventHandler<TPayload> = (payload: TPayload) => void;

export type EventPayloadArguments<TPayload> = [TPayload] extends [void] ? [] : [payload: TPayload];

export interface IEventSource<TEvents> {
  on<TName extends keyof TEvents>(name: TName, handler: EventHandler<TEvents[TName]>): () => void;
}

export interface IEventSubscriberCount<TEvents> {
  subscriberCount(name: keyof TEvents): number;
}

export class EventSource<TEvents> implements IEventSource<TEvents>, IEventSubscriberCount<TEvents> {
  readonly #handlers = new Map<keyof TEvents, Set<EventHandler<never>>>();

  on<TName extends keyof TEvents>(name: TName, handler: EventHandler<TEvents[TName]>): () => void {
    let handlers = this.#handlers.get(name);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(name, handlers);
    }
    // Wrapping keeps each subscription distinct, so subscribing one handler twice needs two unsubscribes.
    const subscription: EventHandler<never> = payload => handler(payload as TEvents[TName]);
    handlers.add(subscription);
    return () => {
      handlers.delete(subscription);
    };
  }

  emit<TName extends keyof TEvents>(name: TName, ...args: EventPayloadArguments<TEvents[TName]>): void {
    const payload = args[0] as never;
    const errors: unknown[] = [];
    for (const handler of Array.from(this.#handlers.get(name) ?? [])) {
      try {
        handler(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} handlers of "${String(name)}" failed.`);
  }

  subscriberCount(name: keyof TEvents): number {
    return this.#handlers.get(name)?.size ?? 0;
  }
}
