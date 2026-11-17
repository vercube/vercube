import type { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * In-process message bus shared by several {@link MemoryWebsocketAdapter}s,
 * standing in for Redis when several application instances run in one
 * process - in tests, typically.
 */
export class MemoryWebsocketBus {
  /** Subscribed adapters by room */
  private readonly fRooms: Map<string, Set<MemoryWebsocketAdapter>> = new Map();

  /**
   * Subscribes an adapter to a room.
   *
   * @param {string} room - The room
   * @param {MemoryWebsocketAdapter} adapter - The adapter
   * @returns {void}
   */
  public subscribe(room: string, adapter: MemoryWebsocketAdapter): void {
    let adapters = this.fRooms.get(room);

    if (!adapters) {
      adapters = new Set();
      this.fRooms.set(room, adapters);
    }

    adapters.add(adapter);
  }

  /**
   * Unsubscribes an adapter from a room.
   *
   * @param {string} room - The room
   * @param {MemoryWebsocketAdapter} adapter - The adapter
   * @returns {void}
   */
  public unsubscribe(room: string, adapter: MemoryWebsocketAdapter): void {
    const adapters = this.fRooms.get(room);

    adapters?.delete(adapter);

    if (adapters?.size === 0) {
      this.fRooms.delete(room);
    }
  }

  /**
   * Delivers a message to every adapter subscribed to its room, the publisher
   * included, like Redis does.
   *
   * @param {WebsocketTypes.AdapterMessage} message - The message
   * @returns {void}
   */
  public publish(message: WebsocketTypes.AdapterMessage): void {
    for (const adapter of this.fRooms.get(message.room) ?? []) {
      adapter.deliver(message);
    }
  }
}

/**
 * {@link WebsocketTypes.Adapter} relaying room publishes over a
 * {@link MemoryWebsocketBus}. Every adapter given the same bus behaves like a
 * separate instance of the application.
 *
 * @example
 * ```ts
 * const bus = new MemoryWebsocketBus();
 *
 * app1.addPlugin(WebsocketPlugin, { adapter: new MemoryWebsocketAdapter(bus) });
 * app2.addPlugin(WebsocketPlugin, { adapter: new MemoryWebsocketAdapter(bus) });
 * ```
 */
export class MemoryWebsocketAdapter implements WebsocketTypes.Adapter {
  /** Hands messages to the service */
  private fOnMessage: ((message: WebsocketTypes.AdapterMessage) => void) | null = null;

  /** Rooms subscribed to, so close() can leave them */
  private readonly fRooms: Set<string> = new Set();

  /**
   * @param {MemoryWebsocketBus} bus - The bus shared with the other instances
   */
  constructor(private readonly bus: MemoryWebsocketBus = new MemoryWebsocketBus()) {}

  /**
   * Stores the callback receiving messages.
   *
   * @param {string} _instanceId - Id of this instance
   * @param {Function} onMessage - Receives the messages
   * @returns {void}
   */
  public init(_instanceId: string, onMessage: (message: WebsocketTypes.AdapterMessage) => void): void {
    this.fOnMessage = onMessage;
  }

  /**
   * Subscribes to a room.
   *
   * @param {string} room - The room
   * @returns {void}
   */
  public subscribe(room: string): void {
    this.fRooms.add(room);
    this.bus.subscribe(room, this);
  }

  /**
   * Unsubscribes from a room.
   *
   * @param {string} room - The room
   * @returns {void}
   */
  public unsubscribe(room: string): void {
    this.fRooms.delete(room);
    this.bus.unsubscribe(room, this);
  }

  /**
   * Publishes a message on the bus.
   *
   * @param {WebsocketTypes.AdapterMessage} message - The message
   * @returns {void}
   */
  public publish(message: WebsocketTypes.AdapterMessage): void {
    this.bus.publish(message);
  }

  /**
   * Leaves every room.
   *
   * @returns {void}
   */
  public close(): void {
    for (const room of this.fRooms) {
      this.bus.unsubscribe(room, this);
    }

    this.fRooms.clear();
    this.fOnMessage = null;
  }

  /**
   * Hands a message from the bus to the service.
   *
   * @param {WebsocketTypes.AdapterMessage} message - The message
   * @returns {void}
   */
  public deliver(message: WebsocketTypes.AdapterMessage): void {
    this.fOnMessage?.(message);
  }
}
