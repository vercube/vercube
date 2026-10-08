import { EventEmitter, on } from 'node:events';

export interface AppEvent {
  type: string;
  payload?: unknown;
}

/**
 * In-process event bus standing in for Redis pub/sub, a message queue etc.
 */
export class EventsService {
  // oxlint-disable-next-line unicorn/prefer-event-target
  private readonly fBus = new EventEmitter();

  public publish(event: AppEvent): void {
    this.fBus.emit('event', event);
  }

  /**
   * Yields published events until the signal aborts, e.g. on client disconnect.
   */
  public async *subscribe(signal: AbortSignal): AsyncGenerator<AppEvent> {
    for await (const [event] of on(this.fBus, 'event', { signal })) {
      yield event;
    }
  }
}
