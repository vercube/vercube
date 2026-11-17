import { $WebsocketService, WebsocketPlugin } from '@vercube/ws';
import { TestingError } from './Errors/TestingError';
import type { TestingTypes } from './Types/TestingTypes';
import type { Container } from '@vercube/di';
import type { WebsocketService, WebsocketTypes, WSPeer } from '@vercube/ws';

/** How long `next()` waits for a frame by default, in milliseconds. */
const DEFAULT_TIMEOUT = 1000;

/** Close code of a normal closure (RFC 6455). */
const CLOSE_NORMAL = 1000;

/** A frame as the server sent it: text or bytes. */
export type TestWebsocketFrame = string | Uint8Array;

/**
 * Options of {@link connectWebsocket}.
 */
export interface ConnectWebsocketOptions {
  /** Query parameters, which `@OnConnectionAttempt()` receives first. */
  query?: Record<string, string>;
  /** Headers of the upgrade request, such as `origin` or `cookie`. */
  headers?: HeadersInit;
}

/**
 * Wraps what a test sends the way `crossws` hands a message to the hooks.
 *
 * @param data - The frame
 * @returns The message
 */
function toMessage(data: TestWebsocketFrame): unknown {
  return {
    rawData: data,
    text: () => (typeof data === 'string' ? data : new TextDecoder().decode(data)),
    uint8Array: () => (typeof data === 'string' ? new TextEncoder().encode(data) : data),
    json: () => JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)),
  };
}

/**
 * Turns what the server sends into a frame, the way a websocket would carry it.
 *
 * @param data - What the server sent
 * @returns The frame
 */
function toFrame(data: unknown): TestWebsocketFrame {
  if (typeof data === 'string') return data;
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data === undefined || data === null) return '';
  return typeof data === 'object' ? JSON.stringify(data) : String(data);
}

/**
 * The peer the service sees for a {@link TestWebsocket}.
 */
class TestPeer {
  public readonly id: string = crypto.randomUUID();

  constructor(
    public readonly namespace: string,
    public readonly request: Request,
    public readonly context: Record<string, unknown>,
    private readonly socket: TestWebsocket,
  ) {}

  public send(data: unknown): number {
    this.socket.receive(toFrame(data));
    return 0;
  }

  public close(code?: number, reason?: string): void {
    void this.socket.serverClose(code ?? CLOSE_NORMAL, reason ?? '');
  }

  public terminate(): void {
    this.close(1006, '');
  }

  public get remoteAddress(): string {
    return '127.0.0.1';
  }

  public toString(): string {
    return this.id;
  }
}

/**
 * An in-memory websocket client, talking to the `WebsocketService` of an app
 * through the same hooks a real server calls - the upgrade, `open`,
 * `message` and `close` - without a socket.
 */
export class TestWebsocket {
  /** Every frame the server sent, in order. */
  public readonly frames: TestWebsocketFrame[] = [];

  /** How the connection ended, once it did. */
  public closed: WebsocketTypes.CloseDetails | null = null;

  /** The peer the service sees. */
  public readonly peer: WSPeer;

  /** Index of the first frame `next()` has not returned yet */
  private fRead: number = 0;

  /** Pending `next()` calls */
  private readonly fWaiters: Array<(frame: TestWebsocketFrame) => void> = [];

  /** Settles once the open hook ran */
  private fOpened: Promise<void> = Promise.resolve();

  /**
   * @param service - The service of the app
   * @param namespace - The path connected to
   * @param request - The upgrade request
   * @param context - The context the upgrade produced
   */
  constructor(
    private readonly service: WebsocketService,
    namespace: string,
    request: Request,
    context: Record<string, unknown>,
  ) {
    this.peer = new TestPeer(namespace, request, context, this) as unknown as WSPeer;
  }

  /**
   * Runs the open hook. Called by {@link connectWebsocket}.
   *
   * @returns Resolves once the `@OnOpen()` handler ran
   */
  public open(): Promise<void> {
    this.fOpened = Promise.resolve(this.service.hooks.open?.(this.peer as never));
    return this.fOpened;
  }

  /**
   * Sends a frame: a string as text, bytes as binary, anything else as JSON text.
   *
   * @param data - What to send
   * @returns Resolves once the handler ran
   */
  public async send(data: string | Uint8Array | ArrayBuffer | object): Promise<void> {
    if (this.closed) {
      throw new TestingError('Cannot send on a closed websocket');
    }

    const frame = data instanceof ArrayBuffer ? new Uint8Array(data) : (toFrame(data) as TestWebsocketFrame);

    await this.service.hooks.message?.(this.peer as never, toMessage(frame) as never);
  }

  /**
   * Sends an `{ event, data }` message, for `@Message({ event })` handlers.
   *
   * @param event - The event
   * @param data - The data
   * @returns Resolves once the handler ran
   */
  public emit(event: string, data?: unknown): Promise<void> {
    return this.send(JSON.stringify({ event, data }));
  }

  /**
   * Returns the next frame the test has not read yet, waiting for it.
   *
   * @param timeout - Milliseconds to wait
   * @returns The frame
   * @throws {TestingError} When no frame arrives in time
   */
  public next(timeout: number = DEFAULT_TIMEOUT): Promise<TestWebsocketFrame> {
    if (this.fRead < this.frames.length) {
      return Promise.resolve(this.frames[this.fRead++]);
    }

    return new Promise((resolve, reject) => {
      const waiter = (frame: TestWebsocketFrame): void => {
        clearTimeout(timer);
        resolve(frame);
      };

      const timer = setTimeout(() => {
        this.fWaiters.splice(this.fWaiters.indexOf(waiter), 1);
        reject(new TestingError(`No websocket frame arrived within ${timeout}ms`));
      }, timeout);

      this.fWaiters.push(waiter);
    });
  }

  /**
   * Returns the next `{ event, data }` message with the event, skipping other frames.
   *
   * @param event - The event
   * @param timeout - Milliseconds to wait for each frame
   * @returns The data of the message
   */
  public async nextEvent<T = unknown>(event: string, timeout: number = DEFAULT_TIMEOUT): Promise<T> {
    for (;;) {
      const frame = await this.next(timeout);

      if (typeof frame !== 'string') continue;

      try {
        const message = JSON.parse(frame) as { event?: unknown; data?: T };
        if (message?.event === event) return message.data as T;
      } catch {
        // not JSON, not an event
      }
    }
  }

  /**
   * Closes the connection from the client side, running the close hook.
   *
   * @param code - Close code
   * @param reason - Close reason
   * @returns Resolves once the `@OnClose()` handler ran
   */
  public async close(code: number = CLOSE_NORMAL, reason: string = ''): Promise<void> {
    if (this.closed) return;

    this.closed = { code, reason };
    await this.fOpened;
    await this.service.hooks.close?.(this.peer as never, { code, reason });
  }

  /**
   * Takes a frame the server sent.
   *
   * @param frame - The frame
   * @returns {void}
   */
  public receive(frame: TestWebsocketFrame): void {
    if (this.closed) return;

    this.frames.push(frame);

    const waiter = this.fWaiters.shift();

    if (waiter) {
      this.fRead++;
      waiter(frame);
    }
  }

  /**
   * Closes the connection from the server side.
   *
   * @param code - Close code
   * @param reason - Close reason
   * @returns Resolves once the close hook ran
   */
  public serverClose(code: number, reason: string): Promise<void> {
    return this.close(code, reason);
  }

  /**
   * Closes the connection when the test leaves its scope.
   *
   * @returns Resolves once closed
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Opens an in-memory websocket to an app with the `WebsocketPlugin`: the
 * upgrade request runs the origin check and `@OnConnectionAttempt()`, then
 * `@OnOpen()` runs, as on a real server.
 *
 * @param target - The app (a `TestApp`, an `App`) or its container
 * @param path - Path of the namespace, such as `/ws/boards/1`
 * @param options - Query and headers of the upgrade request
 * @returns The connected client
 * @throws {TestingError} When the upgrade is rejected; `response` holds the answer
 *
 * @example
 * ```ts
 * const app = await createTestApp({ providers: [BoardGateway], extensions: [testWebsocket()] });
 * const ws = await connectWebsocket(app, '/ws/boards/1', { query: { token: 'secret' } });
 *
 * await ws.send(new Uint8Array([1, 2, 3]));
 * expect(await ws.next()).toEqual(new Uint8Array([1, 2, 3]));
 * ```
 */
export async function connectWebsocket(
  target: { container: Container } | Container,
  path: string,
  options: ConnectWebsocketOptions = {},
): Promise<TestWebsocket> {
  const container = 'container' in target ? target.container : target;
  const service = container.get<WebsocketService>($WebsocketService);
  const url = new URL(path, 'http://localhost');

  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers(options.headers);
  headers.set('upgrade', 'websocket');
  headers.set('connection', 'Upgrade');

  const request = new Request(url, { headers });
  const result = (await service.hooks.upgrade?.(request)) as
    | Response
    | { namespace?: string; context?: Record<string, unknown> }
    | undefined;

  if (result instanceof Response) {
    const body = await result.text().catch(() => '');

    throw new TestingError(`WebSocket upgrade to ${url.pathname} was rejected with ${result.status}: ${body}`, {
      request: { method: 'GET', url: url.toString(), headers },
      response: { status: result.status, headers: result.headers, body },
    });
  }

  // crossws merges the context the upgrade returned into the peer context
  const context: Record<string, unknown> = { ...result?.context };
  const socket = new TestWebsocket(service, result?.namespace ?? url.pathname, request, context);

  await socket.open();

  return socket;
}

/**
 * Installs the `WebsocketPlugin` in a test app, so {@link connectWebsocket}
 * can reach its gateways.
 *
 * @param options - Options of the plugin, such as `adapter` or `maxPayload`
 * @returns The extension
 */
export function testWebsocket(options: WebsocketTypes.Options = {}): TestingTypes.Extension {
  return {
    name: 'testWebsocket',
    setup: (app) => {
      app.addPlugin(WebsocketPlugin, options);
    },
  };
}
