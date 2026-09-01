import { DevtoolsProtocol } from '../Protocol/Frames';

/** A function receiving devtools frames. */
export type DevtoolsSubscriber = (frame: DevtoolsProtocol.Frame) => void;

/**
 * Fan-out hub between the collectors and every connected devtools UI.
 *
 * Also the only place frames are numbered, so the sequence a client sees is
 * continuous across channels and a gap is unambiguous evidence of a dropped
 * message rather than of two independent counters.
 */
export class DevtoolsFrameBus {
  /** Connected subscribers. */
  private fSubscribers: Set<DevtoolsSubscriber> = new Set();

  /** Last sequence number handed out. */
  private fSeq = 0;

  /**
   * Number of currently connected listeners.
   *
   * @returns The subscriber count
   */
  public get size(): number {
    return this.fSubscribers.size;
  }

  /**
   * Registers a subscriber.
   *
   * @param subscriber - Called for every published frame
   * @returns A function that unsubscribes
   */
  public subscribe(subscriber: DevtoolsSubscriber): () => void {
    this.fSubscribers.add(subscriber);

    return () => {
      this.fSubscribers.delete(subscriber);
    };
  }

  /**
   * Wraps a payload in a frame and broadcasts it.
   *
   * @param channel - The channel the payload belongs to
   * @param data - The payload
   */
  public publish<T>(channel: DevtoolsProtocol.Channel, data: T): void {
    if (this.fSubscribers.size === 0) {
      return;
    }

    const frame: DevtoolsProtocol.Frame<T> = {
      v: DevtoolsProtocol.VERSION,
      seq: ++this.fSeq,
      at: Date.now(),
      ch: channel,
      data,
    };

    for (const subscriber of this.fSubscribers) {
      try {
        subscriber(frame);
      } catch {
        // A subscriber that throws is a broken connection, not a reason to
        // stop delivering to everyone else.
        this.fSubscribers.delete(subscriber);
      }
    }
  }
}
