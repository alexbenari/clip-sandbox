import { EventSource, type EventHandler, type IEventSource } from './event-source.js';

export interface IGifSessionStatusEvents {
  changed: void;
}

// The status line both GIF screens show and the preview revision they compare to notice that the
// previewed range changed. Parts update them freely and call changed() once their step is done, so
// the owning session publishes one snapshot per step.
export class GifSessionStatus implements IEventSource<IGifSessionStatusEvents> {
  private readonly events = new EventSource<IGifSessionStatusEvents>();
  private text: string | null = null;
  private revision = 0;

  get message(): string | null { return this.text; }

  get previewRevision(): number { return this.revision; }

  show(message: string | null): void { this.text = message; }

  advancePreview(): void { this.revision += 1; }

  changed(): void { this.events.emit('changed'); }

  on<TName extends keyof IGifSessionStatusEvents>(name: TName, handler: EventHandler<IGifSessionStatusEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }
}
