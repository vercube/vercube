import {
  BadRequestError,
  HttpError,
  HttpServer,
  ShutdownRegistry,
  ValidationProvider,
  safeJsonParse,
  sanitizeObject,
} from '@vercube/core';
import { Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { createInstrument, SpanKind, ValueType } from '@vercube/telemetry/instrument';
import { defineHooks } from 'crossws';
import { plugin } from 'crossws/server';
import { WebsocketTypes } from '../Types/WebsocketTypes';
import { NamespaceMatcher } from '../Utils/NamespaceMatcher';
import type { WSError, WSMessage, WSPeer } from '../Types/WebsocketTypes';
import type { NamespaceMatch } from '../Utils/NamespaceMatcher';
import type { Span } from '@vercube/telemetry/instrument';
import type { Hooks } from 'crossws';
import type { NodeAdapter, NodeOptions } from 'crossws/adapters/node';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * A Node.js `(req, socket, head)` upgrade handler exposed on `globalThis` so
 * environments that drive the server through a raw Node HTTP upgrade event -
 * notably the `@vercube/vite` dev server, where the app runs inside a worker
 * without its own listening `srvx` server - can hand WebSocket upgrades to the
 * same `crossws` hooks. Unused in normal deployments, where `srvx` handles the
 * upgrade natively.
 */
type WsUpgradeGlobal = { __vercube_ws_upgrade__?: (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void> };

/**
 * The `crossws` hooks of the service, with the per-runtime adapter options
 * `crossws/server` reads from `options`.
 */
export type WebsocketHooks = Partial<Hooks> & {
  options?: { node?: NodeOptions; bun?: { idleTimeout?: number }; deno?: { idleTimeout?: number } };
};

/** What the service knows about a connected peer. */
interface PeerState {
  /** The namespace pattern the peer matched */
  pattern: string;
  /** Parameters of the namespace */
  params: WebsocketTypes.NamespaceParams;
  /** Settles once the `@OnOpen()` handler has run */
  ready: Promise<void>;
  /** Rooms the peer is in */
  rooms: Set<string>;
}

/** Close code for a frame larger than `maxPayload` (RFC 6455). */
const CLOSE_MESSAGE_TOO_BIG = 1009;

/** Close code used when the application shuts down (RFC 6455 "going away"). */
const CLOSE_GOING_AWAY = 1001;

/**
 * Records websocket signals.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly.
 */
const instrument = createInstrument('@vercube/ws');

/** Attribute naming the namespace a peer or message belongs to. */
const WS_NAMESPACE = 'vercube.ws.namespace';

/**
 * Records a change in the number of connected peers.
 *
 * An up/down counter rather than a gauge: connects and disconnects are events
 * the service already sees, and counting them is exact, where sampling a peer
 * list on a timer would miss everything that happened between two samples.
 *
 * @param {number} delta - `1` on connect, `-1` on disconnect
 * @param {string} namespace - The namespace the peer belongs to
 * @returns {void}
 */
function countConnection(delta: number, namespace: string): void {
  instrument
    .upDownCounter('vercube.ws.connections', {
      description: 'Currently connected websocket peers.',
      unit: '{connection}',
      valueType: ValueType.INT,
    })
    .add(delta, { [WS_NAMESPACE]: namespace });
}

/**
 * Whether a message arrived as a binary frame. Adapters hand text frames over
 * as strings and binary frames as bytes.
 *
 * @param {WSMessage} message - The message
 * @returns {boolean} Whether it is binary
 */
function isBinaryMessage(message: WSMessage): boolean {
  const raw = (message as { rawData?: unknown }).rawData;
  return raw !== undefined && raw !== null && typeof raw !== 'string';
}

/**
 * Turns what the application sends into a websocket frame: text and bytes as
 * they are, anything else as JSON text.
 *
 * @param {unknown} data - What to send
 * @returns {string | Uint8Array} The frame
 */
function toFrame(data: unknown): string | Uint8Array {
  if (typeof data === 'string' || data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return JSON.stringify(data);
}

/**
 * WebsocketService class responsible for dealing with Websocket connections.
 *
 * This class is responsible for:
 * - Registering namespaces (static or parametric) and accepting websocket connections for them
 * - Registering event, binary and lifecycle handlers and running them
 * - Keeping rooms of peers, and relaying room publishes across instances through an adapter
 */
export class WebsocketService {
  /**
   * Http Server for injecting the server plugin
   */
  @Inject(HttpServer)
  private readonly gHttpServer!: HttpServer;

  /**
   * Validation provider for running the schema validation
   */
  @InjectOptional(ValidationProvider)
  private readonly gValidationProvider!: ValidationProvider | null;

  @InjectOptional(Logger)
  private readonly gLogger!: Logger | null;

  /**
   * Runs the hooks of `app.close()`, to close the peers and the adapter.
   */
  @InjectOptional(ShutdownRegistry)
  private readonly gShutdownRegistry!: ShutdownRegistry | null;

  /**
   * Lazily-created `crossws` Node adapter used for raw Node HTTP upgrades (dev server).
   */
  private fNodeAdapter?: NodeAdapter;

  /**
   * Internal namespace registry: connected peers by lowercased namespace pattern
   */
  private fNamespaces: Record<string, WSPeer[]> = {};

  /**
   * Matches request paths against the namespace patterns
   */
  private readonly fMatcher: NamespaceMatcher = new NamespaceMatcher();

  /**
   * Internal handlers registry
   */
  private fHandlers: {
    [WebsocketTypes.HandlerAction.CONNECTION]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.MESSAGE]: Record<string, Record<string, WebsocketTypes.HandlerAttributes>>;
    [WebsocketTypes.HandlerAction.BINARY]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.OPEN]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.CLOSE]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.ERROR]: Record<string, WebsocketTypes.HandlerAttributes>;
  } = {
    [WebsocketTypes.HandlerAction.CONNECTION]: {}, // namespace -> handler
    [WebsocketTypes.HandlerAction.MESSAGE]: {}, // namespace -> event -> handler
    [WebsocketTypes.HandlerAction.BINARY]: {}, // namespace -> handler
    [WebsocketTypes.HandlerAction.OPEN]: {}, // namespace -> handler
    [WebsocketTypes.HandlerAction.CLOSE]: {}, // namespace -> handler
    [WebsocketTypes.HandlerAction.ERROR]: {}, // namespace -> handler
  };

  /**
   * What the service knows about each connected peer
   */
  private readonly fPeers: WeakMap<WSPeer, PeerState> = new WeakMap();

  /**
   * Local peers by room
   */
  private readonly fRooms: Map<string, Set<WSPeer>> = new Map();

  /**
   * Listeners of remote room messages, by room
   */
  private readonly fRemoteListeners: Map<string, Set<WebsocketTypes.RemoteMessageListener>> = new Map();

  /**
   * Rooms subscribed on the adapter
   */
  private readonly fSubscribed: Set<string> = new Set();

  /**
   * Id of this instance, which tells its own publishes apart on the adapter
   */
  private readonly fInstanceId: string = crypto.randomUUID();

  /**
   * Pub/sub backplane, when configured
   */
  private fAdapter: WebsocketTypes.Adapter | null = null;

  /**
   * Settles once the adapter is initialized
   */
  private fAdapterReady: Promise<void> = Promise.resolve();

  /**
   * Largest accepted frame in bytes
   */
  private fMaxPayload?: number;

  /**
   * The hooks handed to `crossws`, once initialized
   */
  private fHooks: WebsocketHooks | null = null;

  /**
   * Id of this instance, as sent to the adapter.
   */
  public get instanceId(): string {
    return this.fInstanceId;
  }

  /**
   * The `crossws` hooks of the service, for tests and custom servers.
   *
   * @throws {Error} When the service was not initialized
   */
  public get hooks(): WebsocketHooks {
    if (!this.fHooks) {
      throw new Error('WebsocketService is not initialized. Did you add the WebsocketPlugin?');
    }

    return this.fHooks;
  }

  /**
   * Register a new namespace. The path may hold parameters, like an HTTP
   * route: `/ws/boards/:boardId`.
   *
   * @param {string} path - The namespace path to register.
   * @returns {void}
   */
  public registerNamespace(path: string): void {
    if (!this?.fNamespaces?.[path.toLowerCase()]) {
      this.fNamespaces[path.toLowerCase()] = [];
    }

    this.fMatcher.add(path);
  }

  /**
   * Register a new handler for a namespace or event.
   *
   * @param {WebsocketTypes.HandlerAction} action - The handler action type.
   * @param {string} namespace - The namespace to register the handler for.
   * @param {WebsocketTypes.HandlerAttributes} handler - The handler attributes.
   * @returns {void}
   */
  public registerHandler(
    action: WebsocketTypes.HandlerAction,
    namespace: string,
    handler: WebsocketTypes.HandlerAttributes,
  ): void {
    const normalizedNamespace = namespace.toLowerCase();

    if (action === WebsocketTypes.HandlerAction.MESSAGE) {
      const event = handler.event;
      if (!event) {
        this.gLogger?.warn(
          'WebsocketService::registerHandler',
          `Cannot register message handler without an event name for namespace "${normalizedNamespace}".`,
        );
        return;
      }

      // without a provider every message would be dropped, so fail at boot instead
      if (handler.schema && !this.gValidationProvider) {
        throw new Error(
          `Message handler for event "${event}" in namespace "${normalizedNamespace}" has a validationSchema, but no ValidationProvider is registered.`,
        );
      }

      if (!this.fHandlers[action][normalizedNamespace]) {
        this.fHandlers[action][normalizedNamespace] = {};
      }

      this.fHandlers[action][normalizedNamespace][event] = handler;
    } else {
      this.fHandlers[action][normalizedNamespace] = handler;
    }

    // the pattern as written, so parameter names keep their case
    this.registerNamespace(namespace);
  }

  /**
   * Broadcast a message to all peers in the same namespace (including the sender).
   * For a parametric namespace, that is every peer connected to the same path.
   *
   * @param {WSPeer} peer - The sender peer (used to determine the namespace).
   * @param {unknown} message - The message to broadcast.
   * @returns {void}
   */
  public broadcast(peer: WSPeer, message: unknown): void {
    for (const p of this.getNamespacePeers(peer)) {
      p.send(message);
    }
  }

  /**
   * Emit a message to a single peer. A `Uint8Array` goes out as a binary
   * frame, a string as text and anything else as JSON text.
   *
   * @param {WSPeer} peer - The peer to send the message to.
   * @param {unknown} message - The message to send.
   * @returns {void}
   */
  public emit(peer: WSPeer, message: unknown): void {
    peer.send(message);
  }

  /**
   * Broadcast a message to all peers in the same namespace except the sender.
   * For a parametric namespace, that is every peer connected to the same path.
   *
   * @param {WSPeer} peer - The sender peer (used to determine the namespace).
   * @param {unknown} message - The message to broadcast.
   * @returns {void}
   */
  public broadcastOthers(peer: WSPeer, message: unknown): void {
    for (const p of this.getNamespacePeers(peer)) {
      if (p.id !== peer.id) {
        p.send(message);
      }
    }
  }

  /**
   * Returns the parameters of the namespace a peer connected to, such as
   * `{ boardId: '42' }` for `/ws/boards/42` on `/ws/boards/:boardId`.
   *
   * @param {WSPeer} peer - The peer
   * @returns {WebsocketTypes.NamespaceParams} The parameters, empty for a static namespace
   */
  public getParams(peer: WSPeer): WebsocketTypes.NamespaceParams {
    return this.fPeers.get(peer)?.params ?? this.matchNamespace(peer.namespace ?? '')?.params ?? {};
  }

  /**
   * Returns the context of a peer: what its `@OnConnectionAttempt()` handler
   * returned, merged into the `crossws` peer context.
   *
   * @param {WSPeer} peer - The peer
   * @returns {T} The context
   */
  public getContext<T = Record<string, unknown>>(peer: WSPeer): T {
    return peer.context as T;
  }

  /**
   * Puts a peer in a room. A room is any name, independent of the namespace;
   * the peer leaves it on its own when it disconnects.
   *
   * @param {WSPeer} peer - The peer
   * @param {string} room - The room
   * @returns {void}
   */
  public join(peer: WSPeer, room: string): void {
    let peers = this.fRooms.get(room);

    if (!peers) {
      peers = new Set();
      this.fRooms.set(room, peers);
    }

    peers.add(peer);
    this.fPeers.get(peer)?.rooms.add(room);
    this.syncSubscription(room);
  }

  /**
   * Takes a peer out of a room.
   *
   * @param {WSPeer} peer - The peer
   * @param {string} room - The room
   * @returns {void}
   */
  public leave(peer: WSPeer, room: string): void {
    const peers = this.fRooms.get(room);

    if (peers) {
      peers.delete(peer);

      if (peers.size === 0) {
        this.fRooms.delete(room);
      }
    }

    this.fPeers.get(peer)?.rooms.delete(room);
    this.syncSubscription(room);
  }

  /**
   * Returns the local peers of a room.
   *
   * @param {string} room - The room
   * @returns {WSPeer[]} The peers connected to this instance
   */
  public getRoomPeers(room: string): WSPeer[] {
    return [...(this.fRooms.get(room) ?? [])];
  }

  /**
   * Returns the rooms a peer is in.
   *
   * @param {WSPeer} peer - The peer
   * @returns {string[]} The rooms
   */
  public getPeerRooms(peer: WSPeer): string[] {
    const rooms: string[] = [];

    for (const [room, peers] of this.fRooms) {
      if (peers.has(peer)) rooms.push(room);
    }

    return rooms;
  }

  /**
   * Sends a message to every peer in a room, on this instance and - through
   * the adapter - on every other one. A `Uint8Array` goes out as a binary
   * frame, a string as text and anything else as JSON text.
   *
   * Never rejects: a failing adapter is logged, and the local peers have the
   * message either way.
   *
   * @param {string} room - The room
   * @param {unknown} data - What to send
   * @param {WebsocketTypes.PublishOptions} [options] - `except` skips a peer, typically the sender
   * @returns {Promise<void>} Resolves once the adapter took the message
   */
  public async publish(room: string, data: unknown, options: WebsocketTypes.PublishOptions = {}): Promise<void> {
    const frame = toFrame(data);
    const except = typeof options.except === 'string' ? options.except : options.except?.id;

    this.deliverLocal(room, frame, except);

    if (!this.fAdapter) {
      return;
    }

    try {
      await this.fAdapterReady;
      await this.fAdapter.publish({ room, instanceId: this.fInstanceId, data: frame });
    } catch (error) {
      this.gLogger?.error('WebsocketService::publish', `Failed to publish to room "${room}": ${error}`);
    }
  }

  /**
   * Listens to what other instances publish to a room, for an application
   * keeping server-side state per room (a shared document, a game). The room
   * stays subscribed on the adapter while a listener is registered, even
   * without a local peer in it. Messages this instance published never come back.
   *
   * @param {string} room - The room
   * @param {WebsocketTypes.RemoteMessageListener} listener - Receives the data and the room
   * @returns {() => void} Removes the listener again
   */
  public onRemoteMessage(room: string, listener: WebsocketTypes.RemoteMessageListener): () => void {
    let listeners = this.fRemoteListeners.get(room);

    if (!listeners) {
      listeners = new Set();
      this.fRemoteListeners.set(room, listeners);
    }

    listeners.add(listener);
    this.syncSubscription(room);

    return () => {
      const current = this.fRemoteListeners.get(room);

      current?.delete(listener);

      if (current?.size === 0) {
        this.fRemoteListeners.delete(room);
      }

      this.syncSubscription(room);
    };
  }

  /**
   * Origins allowed to open a websocket, `undefined` meaning same-origin only.
   */
  private fAllowedOrigins?: WebsocketTypes.AllowedOrigins;

  /**
   * Initialize the websocket service and attach the server plugin.
   *
   * @param {WebsocketTypes.Options} options - Websocket options
   * @returns {void}
   */
  public initialize(options: WebsocketTypes.Options = {}): void {
    this.fAllowedOrigins = options.allowedOrigins;
    this.fMaxPayload = options.maxPayload;

    if (options.adapter) {
      this.useAdapter(options.adapter);
    }

    const nodeOptions: NodeOptions = {
      ...(options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout }),
      ...(options.maxPayload === undefined ? {} : { serverOptions: { maxPayload: options.maxPayload } }),
    };

    const hooks: WebsocketHooks = defineHooks({
      upgrade: (request: Request) => this.handleUpgrade(request),
      open: (peer: WSPeer) => this.handleOpen(peer),
      message: async (peer: WSPeer, message: WSMessage) => {
        await this.fPeers.get(peer)?.ready;

        if (this.isTooBig(message)) {
          this.gLogger?.warn('WebsocketService::message', `Peer "${peer.id}" sent a frame over maxPayload. Closing it.`);
          peer.close(CLOSE_MESSAGE_TOO_BIG, 'Message too big');
          return;
        }

        if (isBinaryMessage(message) && this.fHandlers[WebsocketTypes.HandlerAction.BINARY][this.resolvePattern(peer) ?? '']) {
          await this.handleBinary(peer, message);
          return;
        }

        await this.handleMessage(peer, message);
      },
      close: (peer: WSPeer, details: WebsocketTypes.CloseDetails) => this.handleClose(peer, details),
      error: async (peer: WSPeer, error: WSError) => {
        this.gLogger?.error('WebsocketService::initialize', `Error: ${error.message}`, {
          peer,
        });

        await this.runLifecycle(WebsocketTypes.HandlerAction.ERROR, peer, error);
      },
    });

    hooks.options = {
      node: nodeOptions,
      bun: options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout },
      deno: options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout },
    };

    this.fHooks = hooks;

    // `plugin()` takes the hooks object itself, and reads the adapter options from `hooks.options`
    const serverPlugin = plugin(hooks);
    this.gHttpServer.addPlugin(serverPlugin);

    // Expose a Node upgrade handler for runtimes that drive the server through a
    // raw HTTP `upgrade` event instead of a listening `srvx` server (the Vite dev
    // server). The `crossws` Node adapter is imported lazily, so non-Node targets
    // and normal deployments never load it. The adapter shares the same `hooks`,
    // so peer and namespace state stays consistent with the `srvx` path.
    (globalThis as WsUpgradeGlobal).__vercube_ws_upgrade__ = async (req, socket, head) => {
      this.fNodeAdapter ??= (await import('crossws/adapters/node')).default({ hooks, ...nodeOptions });
      await this.fNodeAdapter.handleUpgrade(req, socket, head);
    };

    this.gShutdownRegistry?.register(() => this.close());
  }

  /**
   * Closes every connected peer and the adapter. Run by `app.close()`.
   *
   * @returns {Promise<void>} Resolves once the adapter is closed
   */
  public async close(): Promise<void> {
    for (const peers of Object.values(this.fNamespaces)) {
      for (const peer of peers) {
        try {
          peer.close(CLOSE_GOING_AWAY, 'Server shutting down');
        } catch {
          // already gone
        }
      }
    }

    await this.fNodeAdapter?.close().catch(() => {});

    const adapter = this.fAdapter;
    this.fAdapter = null;
    this.fSubscribed.clear();

    await adapter?.close();
  }

  /**
   * Installs the pub/sub adapter.
   *
   * @param {WebsocketTypes.Adapter} adapter - The adapter
   * @returns {void}
   */
  private useAdapter(adapter: WebsocketTypes.Adapter): void {
    this.fAdapter = adapter;
    this.fAdapterReady = Promise.resolve()
      .then(() => adapter.init(this.fInstanceId, (message) => this.handleRemoteMessage(message)))
      .catch((error) => {
        this.gLogger?.error('WebsocketService::useAdapter', `Failed to initialize the adapter: ${error}`);
      });
  }

  /**
   * Accepts or rejects an upgrade request: checks the origin, finds the
   * namespace and runs its `@OnConnectionAttempt()` handler. An object the
   * handler returns becomes the context of the peer.
   *
   * A rejection is returned as a `Response`, which both the `srvx` plugin and
   * the Node adapter answer instead of upgrading.
   *
   * @param {Request} request - The upgrade request
   * @returns {Promise<Response | { namespace: string; headers: Record<string, string>; context?: Record<string, unknown> }>} The decision
   */
  private async handleUpgrade(
    request: Request,
  ): Promise<Response | { namespace: string; headers: Record<string, string>; context?: Record<string, unknown> }> {
    if (!(await this.isOriginAllowed(request))) {
      this.gLogger?.warn(
        'WebsocketService::initialize',
        `Origin "${request.headers.get('origin')}" is not allowed. Connection rejected.`,
      );
      return new Response('Origin not allowed', { status: 403 });
    }

    const url = new URL(request.url);
    const namespace = url.pathname;
    const unsafeParameters = Object.fromEntries(url.searchParams);
    // Sanitize URL parameters to prevent prototype pollution
    const parameters = sanitizeObject(unsafeParameters);
    const match = this.matchNamespace(namespace);

    if (!match) {
      this.gLogger?.warn('WebsocketService::initialize', `Namespace "${namespace}" is not registered. Connection rejected.`);
      return new Response('Namespace not registered', { status: 403 });
    }

    const handler = this.fHandlers[WebsocketTypes.HandlerAction.CONNECTION]?.[match.pattern];
    let context: Record<string, unknown> | undefined;

    if (handler) {
      try {
        const result = await handler.callback(parameters, request, match.params);

        if (result === false) {
          return new Response('Unauthorized', { status: 403 });
        }

        if (result instanceof Response) {
          return result;
        }

        if (result !== null && typeof result === 'object') {
          context = result as Record<string, unknown>;
        }
      } catch (error) {
        if (error instanceof Response) {
          return error;
        }

        if (error instanceof Error) {
          return new Response(error.message, { status: 403 });
        }

        return new Response('Unknown error', { status: 403 });
      }
    }

    return {
      namespace,
      headers: {},
      ...(context ? { context } : {}),
    };
  }

  /**
   * Counts a peer in its namespace and runs the `@OnOpen()` handler. Messages
   * of the peer wait until the handler settled.
   *
   * @param {WSPeer} peer - The peer
   * @returns {Promise<void>} Resolves once the handler ran
   */
  private async handleOpen(peer: WSPeer): Promise<void> {
    const match = this.matchNamespace(peer.namespace ?? '');

    if (!match || !this.fNamespaces[match.pattern]) {
      return;
    }

    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));

    this.fPeers.set(peer, { pattern: match.pattern, params: match.params, ready, rooms: new Set() });
    this.fNamespaces[match.pattern].push(peer);
    countConnection(1, match.pattern);

    try {
      await this.runLifecycle(WebsocketTypes.HandlerAction.OPEN, peer);
    } finally {
      release();
    }
  }

  /**
   * Takes a peer out of its namespace and every room, then runs the
   * `@OnClose()` handler.
   *
   * @param {WSPeer} peer - The peer
   * @param {WebsocketTypes.CloseDetails} details - Close code and reason
   * @returns {Promise<void>} Resolves once the handler ran
   */
  private async handleClose(peer: WSPeer, details: WebsocketTypes.CloseDetails): Promise<void> {
    const state = this.fPeers.get(peer);
    await state?.ready;

    const pattern = state?.pattern ?? this.matchNamespace(peer.namespace ?? '')?.pattern;

    if (!pattern || !this.fNamespaces[pattern]) {
      return;
    }

    const peers = this.fNamespaces[pattern];
    this.fNamespaces[pattern] = peers.filter((p) => p.id !== peer.id);
    countConnection(-1, pattern);

    for (const room of state ? [...state.rooms] : this.getPeerRooms(peer)) {
      this.leave(peer, room);
    }

    await this.runLifecycle(WebsocketTypes.HandlerAction.CLOSE, peer, details);
    this.fPeers.delete(peer);
  }

  /**
   * Runs the lifecycle handler of the namespace of a peer, logging what it throws.
   *
   * @param {WebsocketTypes.HandlerAction} action - OPEN, CLOSE or ERROR
   * @param {WSPeer} peer - The peer
   * @param {unknown} [data] - Close details or the error
   * @returns {Promise<void>} Resolves once the handler ran
   */
  private async runLifecycle(action: WebsocketTypes.HandlerAction, peer: WSPeer, data?: unknown): Promise<void> {
    const pattern = this.resolvePattern(peer);
    const handler = pattern ? (this.fHandlers[action] as Record<string, WebsocketTypes.HandlerAttributes>)[pattern] : undefined;

    if (!handler) {
      return;
    }

    try {
      await (action === WebsocketTypes.HandlerAction.OPEN ? handler.callback(peer) : handler.callback(peer, data));
    } catch (error) {
      this.gLogger?.error('WebsocketService::runLifecycle', `The ${action} handler of "${pattern}" failed: ${error}`);
    }
  }

  /**
   * Finds the namespace of a path.
   *
   * @param {string} path - The path
   * @returns {NamespaceMatch | undefined} The namespace and its parameters
   */
  private matchNamespace(path: string): NamespaceMatch | undefined {
    const lowered = path.toLowerCase();

    if (this.fNamespaces[lowered] && !lowered.includes(':') && !lowered.includes('*')) {
      return { pattern: lowered, params: {} };
    }

    const match = this.fMatcher.match(path);

    return match && this.fNamespaces[match.pattern] ? match : undefined;
  }

  /**
   * Returns the namespace pattern of a peer.
   *
   * @param {WSPeer} peer - The peer
   * @returns {string | undefined} The lowercased pattern
   */
  private resolvePattern(peer: WSPeer): string | undefined {
    return this.fPeers.get(peer)?.pattern ?? this.matchNamespace(peer.namespace ?? '')?.pattern ?? peer.namespace?.toLowerCase();
  }

  /**
   * Returns the peers connected to the same path as a peer.
   *
   * @param {WSPeer} peer - The peer
   * @returns {WSPeer[]} The peers, the peer included
   */
  private getNamespacePeers(peer: WSPeer): WSPeer[] {
    const namespace = peer.namespace?.toLowerCase();
    if (!namespace) return [];

    const pattern = this.resolvePattern(peer);
    const peers = pattern ? this.fNamespaces[pattern] : undefined;
    if (!peers || peers.length === 0) return [];

    return peers.filter((p) => p.namespace?.toLowerCase() === namespace);
  }

  /**
   * Sends a frame to the local peers of a room.
   *
   * @param {string} room - The room
   * @param {string | Uint8Array} frame - The frame
   * @param {string} [except] - Id of a peer to skip
   * @returns {void}
   */
  private deliverLocal(room: string, frame: string | Uint8Array, except?: string): void {
    for (const peer of this.fRooms.get(room) ?? []) {
      if (peer.id === except) continue;

      try {
        peer.send(frame);
      } catch (error) {
        this.gLogger?.warn('WebsocketService::publish', `Failed to send to peer "${peer.id}": ${error}`);
      }
    }
  }

  /**
   * Delivers a message another instance published: to the local peers of the
   * room, then to the remote listeners. The echo of this instance is dropped.
   *
   * @param {WebsocketTypes.AdapterMessage} message - The message
   * @returns {void}
   */
  private handleRemoteMessage(message: WebsocketTypes.AdapterMessage): void {
    if (message.instanceId === this.fInstanceId) {
      return;
    }

    this.deliverLocal(message.room, message.data);

    for (const listener of this.fRemoteListeners.get(message.room) ?? []) {
      Promise.resolve()
        .then(() => listener(message.data, message.room))
        .catch((error) => {
          this.gLogger?.error('WebsocketService::onRemoteMessage', `A listener of room "${message.room}" failed: ${error}`);
        });
    }
  }

  /**
   * Subscribes a room on the adapter while it has a local peer or a remote
   * listener, and unsubscribes it once it has neither.
   *
   * @param {string} room - The room
   * @returns {void}
   */
  private syncSubscription(room: string): void {
    const adapter = this.fAdapter;
    if (!adapter) return;

    const wanted = this.fRooms.has(room) || this.fRemoteListeners.has(room);
    const subscribed = this.fSubscribed.has(room);

    if (wanted === subscribed) return;

    if (wanted) {
      this.fSubscribed.add(room);
    } else {
      this.fSubscribed.delete(room);
    }

    this.fAdapterReady = this.fAdapterReady
      .then(() => (wanted ? adapter.subscribe(room) : adapter.unsubscribe(room)))
      .catch((error) => {
        this.gLogger?.error(
          'WebsocketService::syncSubscription',
          `Failed to ${wanted ? 'subscribe to' : 'unsubscribe from'} room "${room}": ${error}`,
        );
      });
  }

  /**
   * Whether a frame is larger than `maxPayload`.
   *
   * @param {WSMessage} message - The message
   * @returns {boolean} Whether it has to be refused
   */
  private isTooBig(message: WSMessage): boolean {
    const max = this.fMaxPayload;
    if (max === undefined) return false;

    const raw = (message as { rawData?: unknown }).rawData;

    if (typeof raw === 'string') {
      // a UTF-8 character takes 1 to 3 bytes per UTF-16 unit, so only measure near the limit
      if (raw.length * 3 <= max) return false;
      return new TextEncoder().encode(raw).byteLength > max;
    }

    if (raw === undefined || raw === null) return false;

    return message.uint8Array().byteLength > max;
  }

  /**
   * Checks the `Origin` header of an upgrade request. Browsers attach cookies to
   * a cross-site websocket handshake and no CORS preflight runs, so this is the
   * only guard against cross-site websocket hijacking.
   *
   * @param {Request} request - The upgrade request
   * @returns {Promise<boolean>} Whether the request may continue
   * @private
   */
  private async isOriginAllowed(request: Request): Promise<boolean> {
    const origin = request.headers.get('origin');

    // non-browser clients do not send an Origin and cannot carry a victim's cookies
    if (origin === null) return true;

    const allowed = this.fAllowedOrigins;

    if (allowed === '*') return true;
    if (typeof allowed === 'function') {
      try {
        return (await allowed(origin, request)) === true;
      } catch (error) {
        this.gLogger?.error('WebsocketService::isOriginAllowed', `allowedOrigins threw: ${error}`);
        return false;
      }
    }

    const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();

    if (Array.isArray(allowed)) {
      return allowed.some((o) => o.trim().replace(/\/+$/, '').toLowerCase() === normalized);
    }

    // default: same origin, compared by host so a TLS-terminating proxy does not break it
    let originHost: string;
    try {
      originHost = new URL(normalized).host;
    } catch {
      return false;
    }

    if (!originHost) return false;

    const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host'), new URL(request.url).host];

    return hosts.some((host) => !!host && host.split(',')[0].trim().toLowerCase() === originHost);
  }

  /**
   * Handle a binary frame for a peer with the `@OnBinary()` handler of its namespace.
   *
   * @param {WSPeer} peer - The peer the frame came from
   * @param {WSMessage} message - The frame
   * @returns {Promise<void>}
   */
  private async handleBinary(peer: WSPeer, message: WSMessage): Promise<void> {
    await instrument.span(
      'ws.binary',
      { kind: SpanKind.CONSUMER, attributes: { [WS_NAMESPACE]: peer.namespace ?? '' } },
      async () => {
        const handler = this.fHandlers[WebsocketTypes.HandlerAction.BINARY][this.resolvePattern(peer) ?? ''];

        try {
          await handler?.callback(message.uint8Array(), peer);
        } catch (error) {
          this.gLogger?.error('WebsocketService::handleBinary', `Failed to process binary message: ${error}`);
          this.emitError(peer, undefined, error);
        }
      },
    );
  }

  /**
   * Handle an incoming websocket message for a peer.
   *
   * @param {WSPeer} peer - The peer receiving the message.
   * @param {Message} rawMessage - The raw websocket message.
   * @returns {Promise<void>}
   */
  private async handleMessage(peer: WSPeer, rawMessage: WSMessage): Promise<void> {
    // A websocket message is work the server does on its own behalf, so it gets
    // a CONSUMER span of its own rather than hanging off whatever request
    // happened to open the socket.
    await instrument.span(
      'ws.message',
      { kind: SpanKind.CONSUMER, attributes: { [WS_NAMESPACE]: peer.namespace ?? '' } },
      (span) => this.internalHandleMessage(peer, rawMessage, span),
    );
  }

  /**
   * Dispatches one websocket message to its handler.
   *
   * @param {WSPeer} peer - The peer the message came from
   * @param {WSMessage} rawMessage - The raw message
   * @param {Span} span - The span covering this message
   * @returns {Promise<void>} Resolves once the handler has run
   * @private
   */
  private async internalHandleMessage(peer: WSPeer, rawMessage: WSMessage, span: Span): Promise<void> {
    let event: unknown;

    try {
      const msg = safeJsonParse(rawMessage.text()) as any;
      const namespace = this.resolvePattern(peer);
      event = msg.event;
      let data = msg.data;

      span.updateName(`ws.message ${String(event)}`);
      span.setAttribute('vercube.ws.event', String(event));

      const handler = namespace
        ? this.fHandlers[WebsocketTypes.HandlerAction.MESSAGE]?.[namespace]?.[event as string]
        : undefined;

      if (!handler) {
        this.gLogger?.warn(
          'WebsocketService::handleMessage',
          `No message handler for event "${event}" in namespace "${namespace}"`,
        );
        return;
      }

      if (handler.schema) {
        if (!this.gValidationProvider) {
          throw new Error('ValidationProvider is not registered');
        }

        const result = await this.gValidationProvider.validate(handler.schema, data);

        if (result?.issues?.length) {
          throw new BadRequestError('Websocket message validation error', result.issues);
        }

        // hand the parsed value to the handler, so coercions, defaults, transforms
        // and stripped keys take effect
        if (result && 'value' in result) {
          data = result.value;
        }
      }

      await handler.callback(data, peer);
    } catch (error) {
      this.gLogger?.error('WebsocketService::handleMessage', `Failed to process message: ${error}`);
      this.emitError(peer, event, error);
    }
  }

  /**
   * Tells the peer a message failed, with an `error` frame. An HTTP error such
   * as a validation error carries its message and issues; anything else is
   * reported without details, which stay in the server log.
   *
   * @param {WSPeer} peer - The peer the message came from
   * @param {unknown} event - The event of the failed message
   * @param {unknown} error - What went wrong
   * @returns {void}
   * @private
   */
  private emitError(peer: WSPeer, event: unknown, error: unknown): void {
    const known = error instanceof HttpError;
    const issues = known ? (error as { errors?: unknown }).errors : undefined;

    try {
      this.emit(peer, {
        event: 'error',
        data: {
          event: typeof event === 'string' ? event : undefined,
          status: known ? error.status : 500,
          message: known ? error.message : 'Failed to process message',
          ...(issues === undefined ? {} : { issues }),
        },
      });
    } catch (sendError) {
      this.gLogger?.warn('WebsocketService::handleMessage', `Failed to send the error to the peer: ${sendError}`);
    }
  }
}
