import { Redis } from 'ioredis';
import type { WebsocketTypes } from '../Types/WebsocketTypes';
import type { Cluster } from 'ioredis';

/** Options of the {@link RedisWebsocketAdapter}. */
export interface RedisWebsocketAdapterOptions {
  /**
   * Connection URL, such as `redis://localhost:6379`. Ignored when `client` is given.
   * @default 'redis://127.0.0.1:6379'
   */
  url?: string;

  /**
   * An existing client, used to publish. A connection in subscriber mode can
   * do nothing else, so the adapter subscribes on a duplicate of it. The
   * adapter never closes a client it was given, only its duplicate.
   */
  client?: Redis | Cluster;

  /**
   * Prefix of every channel the adapter uses. Instances talk to each other
   * only when they share it.
   * @default 'vercube:ws'
   */
  prefix?: string;
}

/** Envelope kind of a text payload */
const KIND_TEXT = 0;

/** Envelope kind of a binary payload */
const KIND_BINARY = 1;

/** Bytes before the header: the kind and the header length */
const PREAMBLE = 3;

/** Largest header the 16-bit length can describe */
const MAX_HEADER = 0xff_ff;

/**
 * Encodes a message as one binary Redis payload: a kind byte (text or
 * binary), the length of a small JSON header with the instance id, then the
 * payload as is. Binary payloads are never base64-encoded.
 *
 * @param {WebsocketTypes.AdapterMessage} message - The message
 * @returns {Buffer} The payload
 */
export function encodeAdapterMessage(message: WebsocketTypes.AdapterMessage): Buffer {
  const header = Buffer.from(JSON.stringify({ i: message.instanceId }));

  if (header.length > MAX_HEADER) {
    throw new Error('RedisWebsocketAdapter::instance id is too long');
  }

  const isText = typeof message.data === 'string';
  const body = isText ? Buffer.from(message.data as string) : Buffer.from(message.data as Uint8Array);
  const preamble = Buffer.alloc(PREAMBLE);

  preamble.writeUInt8(isText ? KIND_TEXT : KIND_BINARY, 0);
  preamble.writeUInt16BE(header.length, 1);

  return Buffer.concat([preamble, header, body]);
}

/**
 * Decodes a payload written by {@link encodeAdapterMessage}.
 *
 * @param {string} room - The room the payload was published to
 * @param {Buffer} payload - The payload
 * @returns {WebsocketTypes.AdapterMessage | null} The message, or null when the payload is not one
 */
export function decodeAdapterMessage(room: string, payload: Buffer): WebsocketTypes.AdapterMessage | null {
  if (payload.length < PREAMBLE) {
    return null;
  }

  const kind = payload.readUInt8(0);
  const headerLength = payload.readUInt16BE(1);

  if ((kind !== KIND_TEXT && kind !== KIND_BINARY) || payload.length < PREAMBLE + headerLength) {
    return null;
  }

  let header: { i?: unknown };

  try {
    header = JSON.parse(payload.subarray(PREAMBLE, PREAMBLE + headerLength).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof header?.i !== 'string') {
    return null;
  }

  const body = payload.subarray(PREAMBLE + headerLength);

  return {
    room,
    instanceId: header.i,
    data: kind === KIND_TEXT ? body.toString('utf8') : new Uint8Array(body),
  };
}

/**
 * {@link WebsocketTypes.Adapter} fanning room publishes out across instances
 * over Redis pub/sub, one channel per room (`<prefix>:room:<room>`), so an
 * instance only receives the rooms it has peers in.
 *
 * Requires the optional `ioredis` dependency.
 *
 * @example
 * ```ts
 * import { WebsocketPlugin } from '@vercube/ws';
 * import { RedisWebsocketAdapter } from '@vercube/ws/adapters/RedisAdapter';
 *
 * app.addPlugin(WebsocketPlugin, {
 *   adapter: new RedisWebsocketAdapter({ url: process.env.REDIS_URL }),
 * });
 * ```
 */
export class RedisWebsocketAdapter implements WebsocketTypes.Adapter {
  /** Client publishing messages */
  private fPublisher: Redis | Cluster | null = null;

  /** Client in subscriber mode */
  private fSubscriber: Redis | Cluster | null = null;

  /** Whether the adapter created the publisher, and therefore has to close it */
  private fOwnsPublisher: boolean = false;

  /** Channel prefix */
  private readonly fPrefix: string;

  /**
   * @param {RedisWebsocketAdapterOptions} options - Connection options
   */
  constructor(private readonly options: RedisWebsocketAdapterOptions = {}) {
    this.fPrefix = options.prefix ?? 'vercube:ws';
  }

  /**
   * Connects both clients and starts listening.
   *
   * @param {string} _instanceId - Id of this instance
   * @param {Function} onMessage - Receives the messages
   * @returns {void}
   */
  public init(_instanceId: string, onMessage: (message: WebsocketTypes.AdapterMessage) => void): void {
    if (this.options.client) {
      this.fPublisher = this.options.client;
    } else {
      this.fPublisher = new Redis(this.options.url ?? 'redis://127.0.0.1:6379');
      this.fOwnsPublisher = true;
    }

    // `duplicate()` differs between Redis and Cluster, and no union of the two is callable
    const subscriber: Redis | Cluster = (this.fPublisher as Redis).duplicate();
    this.fSubscriber = subscriber;

    const channelPrefix = this.channel('');

    subscriber.on('messageBuffer', (channel: Buffer, payload: Buffer) => {
      const name = channel.toString('utf8');

      if (!name.startsWith(channelPrefix)) {
        return;
      }

      const message = decodeAdapterMessage(name.slice(channelPrefix.length), payload);

      if (message) {
        onMessage(message);
      }
    });
  }

  /**
   * Subscribes to the channel of a room.
   *
   * @param {string} room - The room
   * @returns {Promise<void>} Resolves once subscribed
   */
  public async subscribe(room: string): Promise<void> {
    await this.subscriber.subscribe(this.channel(room));
  }

  /**
   * Unsubscribes from the channel of a room.
   *
   * @param {string} room - The room
   * @returns {Promise<void>} Resolves once unsubscribed
   */
  public async unsubscribe(room: string): Promise<void> {
    await this.subscriber.unsubscribe(this.channel(room));
  }

  /**
   * Publishes a message to the channel of its room.
   *
   * @param {WebsocketTypes.AdapterMessage} message - The message
   * @returns {Promise<void>} Resolves once Redis took it
   */
  public async publish(message: WebsocketTypes.AdapterMessage): Promise<void> {
    if (!this.fPublisher) {
      throw new Error('RedisWebsocketAdapter::not initialized');
    }

    await this.fPublisher.publish(this.channel(message.room), encodeAdapterMessage(message));
  }

  /**
   * Closes the subscriber, and the publisher when the adapter created it.
   *
   * @returns {Promise<void>} Resolves once closed
   */
  public async close(): Promise<void> {
    const subscriber = this.fSubscriber;
    const publisher = this.fPublisher;

    this.fSubscriber = null;
    this.fPublisher = null;

    await subscriber?.quit().catch(() => subscriber.disconnect());

    if (publisher && this.fOwnsPublisher) {
      await publisher.quit().catch(() => publisher.disconnect());
    }
  }

  /**
   * Returns the subscriber client.
   *
   * @returns {Redis | Cluster} The client
   */
  private get subscriber(): Redis | Cluster {
    if (!this.fSubscriber) {
      throw new Error('RedisWebsocketAdapter::not initialized');
    }

    return this.fSubscriber;
  }

  /**
   * Returns the channel of a room.
   *
   * @param {string} room - The room
   * @returns {string} The channel
   */
  private channel(room: string): string {
    return `${this.fPrefix}:room:${room}`;
  }
}
