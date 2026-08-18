import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** A function receiving devtools stream events. */
export type DevtoolsSubscriber = (event: DevtoolsTypes.StreamEvent) => void;

/**
 * Fan-out hub between collectors and connected devtools UIs.
 * Subscriber errors are swallowed and the subscriber is dropped.
 */
export class DevtoolsEventBus {
  private fSubscribers: Set<DevtoolsSubscriber> = new Set();

  /**
   * Number of currently connected listeners.
   * @returns count of active subscribers
   */
  public get size(): number {
    return this.fSubscribers.size;
  }

  /**
   * Registers a subscriber.
   * @param subscriber callback invoked for every published event
   * @returns disposer removing the subscriber
   */
  public subscribe(subscriber: DevtoolsSubscriber): () => void {
    this.fSubscribers.add(subscriber);

    return () => {
      this.fSubscribers.delete(subscriber);
    };
  }

  /**
   * Publishes an event to every subscriber.
   * @param event event to broadcast
   */
  public publish(event: DevtoolsTypes.StreamEvent): void {
    for (const subscriber of this.fSubscribers) {
      try {
        subscriber(event);
      } catch {
        this.fSubscribers.delete(subscriber);
      }
    }
  }
}
