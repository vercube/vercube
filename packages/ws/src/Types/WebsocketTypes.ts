import { type ValidationTypes } from '@vercube/core';
import { type Message, type Peer, type WSError } from 'crossws';

// re-export the Peer type from crossws
export { type Peer as WSPeer, type Message as WSMessage, type WSError };

export namespace WebsocketTypes {
  export enum HandlerAction {
    CONNECTION = 'connection',
    MESSAGE = 'message',
    BINARY = 'binary',
    OPEN = 'open',
    CLOSE = 'close',
    ERROR = 'error',
  }

  export type HandlerAttributes = {
    callback: Function;
    event?: string; // message event to listen to
    schema?: ValidationTypes.Schema;
  };

  /**
   * Decides which browser origins may open a websocket.
   *
   * - `string[]`: exact origins such as `https://app.example.com`
   * - `'*'`: any origin (turns the check off)
   * - a function: custom decision for each origin
   */
  export type AllowedOrigins = string[] | '*' | ((origin: string, request: Request) => boolean | Promise<boolean>);

  /**
   * Parameters matched from a parametric namespace, such as `{ boardId: '42' }`
   * for a peer connected to `/ws/boards/42` on `@Namespace('/ws/boards/:boardId')`.
   */
  export type NamespaceParams = Record<string, string>;

  /**
   * What a peer sent, or what is sent to peers: text, binary, or a value
   * serialized to JSON text.
   */
  export type Payload = string | Uint8Array | ArrayBuffer | Record<string, unknown> | unknown[];

  /**
   * Details of a closed connection, as given to `@OnClose()` handlers.
   */
  export interface CloseDetails {
    code?: number;
    reason?: string;
  }

  /**
   * Options of `WebsocketService.publish()`.
   */
  export interface PublishOptions {
    /**
     * A peer (or a peer id) that does not receive the message, typically the
     * sender. Remote instances never have this peer, so it only matters locally.
     */
    except?: Peer | string;
  }

  /**
   * A room message travelling between instances through a {@link Adapter}.
   */
  export interface AdapterMessage {
    /** The room the message was published to. */
    room: string;
    /** Id of the instance that published it, used to drop its own echo. */
    instanceId: string;
    /** Serialized payload: text frames stay strings, binary frames bytes. */
    data: string | Uint8Array;
  }

  /**
   * Pub/sub backplane fanning room publishes out across instances of the
   * application (processes, containers, regions).
   *
   * The service subscribes a room while it has a local peer in it, or while
   * the application listens to it with `onRemoteMessage()`, and drops the
   * messages it published itself by comparing `instanceId`.
   */
  export interface Adapter {
    /**
     * Called once by the service before anything else.
     *
     * @param instanceId - Id of this instance
     * @param onMessage - Hands a message published by any instance to the service
     */
    init(instanceId: string, onMessage: (message: AdapterMessage) => void): void | Promise<void>;
    /** Starts receiving the messages of a room. */
    subscribe(room: string): void | Promise<void>;
    /** Stops receiving the messages of a room. */
    unsubscribe(room: string): void | Promise<void>;
    /** Sends a message to every instance subscribed to its room. */
    publish(message: AdapterMessage): void | Promise<void>;
    /** Releases the connections the adapter owns. */
    close(): void | Promise<void>;
  }

  /**
   * Called with every message published to a room by another instance.
   */
  export type RemoteMessageListener = (data: string | Uint8Array, room: string) => void | Promise<void>;

  /**
   * Options accepted by `WebsocketPlugin`.
   */
  export interface Options {
    /**
     * Origins allowed to open a websocket. Requests without an `Origin` header
     * (non-browser clients) are always accepted. When omitted, only same-origin
     * browser requests are accepted: the `Origin` host must match the `Host`
     * (or `X-Forwarded-Host`) header of the upgrade request.
     */
    allowedOrigins?: AllowedOrigins;

    /**
     * Closes a connection that stayed silent - no message and no pong - for about
     * this many seconds. On Node the server pings every peer on this interval;
     * Bun and Deno use their native idle timeout. `0` turns it off.
     * @default 30
     */
    idleTimeout?: number;

    /**
     * Largest accepted frame, in bytes. A peer sending a larger one is closed
     * with code `1009` (message too big). Unlimited when omitted (Node's `ws`
     * still caps frames at 100 MiB).
     */
    maxPayload?: number;

    /**
     * Pub/sub backplane relaying `publish()` to the other instances, such as
     * `RedisWebsocketAdapter` from `@vercube/ws/adapters/RedisAdapter`.
     * Rooms stay local to the instance when omitted.
     */
    adapter?: Adapter;
  }
}
