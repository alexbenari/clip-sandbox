type IpcHandler = (event: unknown, payload?: unknown) => unknown;

export class FakeIpcMain {
  readonly #handlers = new Map<string, IpcHandler>();

  handle(channel: string, handler: IpcHandler): void {
    this.#handlers.set(channel, handler);
  }

  invoke(channel: string, event: unknown, payload?: unknown): Promise<any> {
    const handler = this.#handlers.get(channel);
    if (!handler) throw new Error(`No handler is registered for ${channel}.`);
    return Promise.resolve(handler(event, payload));
  }
}
