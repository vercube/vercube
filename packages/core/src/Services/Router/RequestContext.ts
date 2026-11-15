import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Store held by {@link AsyncLocalStorage} for the duration of one request.
 *
 * The backing map is created on first write: most requests never touch the
 * context, so allocating a `Map` for every one of them is pure overhead.
 *
 * Telemetry opens nested frames on the same storage (see
 * {@link RequestContext.runWithOtelContext}) so that a trace context and the
 * request context share a single `AsyncLocalStorage`. Nested frames carry their
 * own {@link RequestContextStore.otel} but point {@link RequestContextStore.root}
 * at the frame the request started in, so `set()` from anywhere inside the
 * request stays visible everywhere else in it.
 */
interface RequestContextStore {
  /** The frame the request started in. The root frame points at itself. */
  root: RequestContextStore;
  /** Lazily created key/value store. Only ever read from and written to on the root. */
  map: Map<string, unknown> | null;
  /** Opaque OpenTelemetry `Context`. Core never inspects it. */
  otel: unknown;
  /** Callbacks waiting for the response of the request. Only ever on the root. */
  settled: SettledCallback[] | null;
}

/**
 * Called with the response a request is answered with, see
 * {@link RequestContext.onSettled}.
 */
export type SettledCallback = (response: Response) => unknown;

/**
 * Creates a fresh root frame.
 *
 * @param otel - Optional OpenTelemetry context to seed the frame with
 * @returns The new store, pointing at itself as its own root
 */
function createRootStore(otel: unknown = undefined): RequestContextStore {
  const store: RequestContextStore = { root: undefined as unknown as RequestContextStore, map: null, otel, settled: null };
  store.root = store;

  return store;
}

/**
 * Request context storage using AsyncLocalStorage.
 * This allows storing request-specific data that is automatically cleaned up after the request completes.
 */
export class RequestContext {
  /** The storage for the request context */
  private readonly fStorage: AsyncLocalStorage<RequestContextStore>;

  /**
   * Initializes the request storage.
   */
  constructor() {
    this.fStorage = new AsyncLocalStorage<RequestContextStore>();
  }

  /**
   * Runs a function within a request context.
   *
   * This initializes a new context for the request. The context is automatically cleaned up
   * by Node.js's AsyncLocalStorage when the function completes (either successfully or with an error).
   *
   * The cleanup happens automatically - you don't need to manually clear the context.
   * The context is available throughout the entire async execution chain of the function,
   * including all nested async operations, but is automatically destroyed when the function
   * passed to `run()` completes.
   *
   * The return value is passed through unchanged, so a synchronous callback stays
   * synchronous instead of being wrapped in a promise.
   *
   * @param fn - The function to run within the context
   * @returns The result of the function
   */
  public run<T>(fn: () => T): T {
    // AsyncLocalStorage automatically cleans up the context when fn() completes
    return this.fStorage.run(createRootStore(), fn);
  }

  /**
   * Runs a request within a request context and hands the response it is
   * answered with to the callbacks registered through
   * {@link RequestContext.onSettled}.
   *
   * A synchronous response stays synchronous unless a callback returned a
   * promise, which is then waited for before the response is passed on.
   *
   * @param fn - Produces the response of the request
   * @returns The response
   */
  public runRequest(fn: () => Response | Promise<Response>): Response | Promise<Response> {
    const store = createRootStore();

    // Settled inside the frame, so a callback still sees the request context.
    return this.fStorage.run(store, () => settleOn(store, fn()));
  }

  /**
   * Hands a response to the callbacks registered through
   * {@link RequestContext.onSettled} for the current request.
   *
   * {@link RequestContext.runRequest} does this itself. This is for a caller
   * that has to settle the request somewhere inside the frame, such as inside
   * the span that traces it.
   *
   * @param response - The response of the request
   * @returns The response
   */
  public settle(response: Response | Promise<Response>): Response | Promise<Response> {
    const store = this.fStorage.getStore();

    return store ? settleOn(store.root, response) : response;
  }

  /**
   * Registers a callback for the response this request is answered with,
   * whatever produced it: the handler, a middleware that ended the request
   * early, the error handler, or the answer to a request no route matched.
   *
   * A middleware `onResponse` hook does not see those: it runs before the
   * response is built and is skipped when the request fails. A promise the
   * callback returns is waited for before the response is sent; what it throws
   * or rejects with is ignored. Outside of a request the callback is dropped.
   *
   * @param callback - Receives the final response
   */
  public onSettled(callback: SettledCallback): void {
    const store = this.fStorage.getStore();

    if (store) {
      (store.root.settled ??= []).push(callback);
    }
  }

  /**
   * Sets a value in the current request context.
   *
   * @param key - The key to store the value under
   * @param value - The value to store
   * @throws Error if called outside of a request context
   */
  public set(key: string, value: unknown): void {
    const store = this.fStorage.getStore();

    if (!store) {
      throw new Error(
        'RequestContext.set() called outside of request context. The context is automatically initialized by RequestHandler.',
      );
    }

    const root = store.root;
    (root.map ??= new Map<string, unknown>()).set(key, value);
  }

  /**
   * Gets a value from the current request context.
   *
   * @param key - The key to retrieve
   * @returns The value if found, undefined otherwise
   * @throws Error if called outside of a request context
   */
  public get<T = unknown>(key: string): T | undefined {
    const store = this.fStorage.getStore();

    if (!store) {
      throw new Error(
        'RequestContext.get() called outside of request context. The context is automatically initialized by RequestHandler.',
      );
    }

    return store.root.map?.get(key) as T | undefined;
  }

  /**
   * Gets a value from the current request context, or returns a default value if not found.
   *
   * @param key - The key to retrieve
   * @param defaultValue - The default value to return if key is not found
   * @returns The value if found, defaultValue otherwise
   */
  public getOrDefault<T = unknown>(key: string, defaultValue: T): T {
    const value = this.get<T>(key);
    return value === undefined ? defaultValue : value;
  }

  /**
   * Checks if a key exists in the current request context.
   *
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  public has(key: string): boolean {
    return this.fStorage.getStore()?.root.map?.has(key) ?? false;
  }

  /**
   * Gets all keys in the current request context.
   *
   * @returns Array of keys in the context
   */
  public keys(): string[] {
    const map = this.fStorage.getStore()?.root.map;
    return map ? [...map.keys()] : [];
  }

  /**
   * Gets all values in the current request context.
   *
   * @returns Map of all key-value pairs in the context
   */
  public getAll(): Map<string, unknown> {
    const map = this.fStorage.getStore()?.root.map;
    return map ? new Map(map) : new Map();
  }

  /**
   * Whether execution is currently inside a request context frame.
   *
   * @returns True when a frame is active
   */
  public get active(): boolean {
    return this.fStorage.getStore() !== undefined;
  }

  /**
   * Returns the OpenTelemetry context attached to the current frame.
   *
   * Typed as `unknown` on purpose: core has no OpenTelemetry dependency and
   * never looks inside the value. `@vercube/telemetry` casts it back.
   *
   * @returns The active OpenTelemetry context, or undefined
   */
  public getOtelContext(): unknown {
    return this.fStorage.getStore()?.otel;
  }

  /**
   * Runs `fn` in a nested frame carrying `otel` as the active OpenTelemetry
   * context, reusing this request's storage instead of a second
   * `AsyncLocalStorage`.
   *
   * Called outside a request (during bootstrap, for example) it opens a fresh
   * root frame so spans still nest correctly.
   *
   * @param otel - The OpenTelemetry context to make active
   * @param fn - The function to run
   * @returns The result of the function, passed through unchanged
   */
  public runWithOtelContext<T>(otel: unknown, fn: () => T): T {
    const store = this.fStorage.getStore();

    if (!store) {
      return this.fStorage.run(createRootStore(otel), fn);
    }

    return this.fStorage.run({ root: store.root, map: null, otel, settled: null }, fn);
  }
}

/**
 * Hands a response to the callbacks of a request once it is known.
 *
 * @param root - The frame the request started in
 * @param response - The response of the request
 * @returns The response
 */
function settleOn(root: RequestContextStore, response: Response | Promise<Response>): Response | Promise<Response> {
  if (response instanceof Promise) {
    return response.then((settled) => (root.settled === null ? settled : notifySettled(root.settled, settled)));
  }

  return root.settled === null ? response : notifySettled(root.settled, response);
}

/**
 * Hands the response of a request to the callbacks waiting for it.
 *
 * @param callbacks - The callbacks registered during the request
 * @param response - The response the request is answered with
 * @returns The response, once every callback that returned a promise settled
 */
function notifySettled(callbacks: SettledCallback[], response: Response): Response | Promise<Response> {
  let pending: Promise<unknown>[] | undefined;

  for (const callback of callbacks) {
    try {
      const result = callback(response);

      if (result instanceof Promise) {
        (pending ??= []).push(result.catch(ignore));
      }
    } catch {
      // a callback must not change what the request is answered with
    }
  }

  if (pending === undefined) {
    return response;
  }

  return (pending.length === 1 ? pending[0] : Promise.all(pending)).then(() => response);
}

/**
 * Ignores a rejection.
 *
 * @returns {void}
 */
function ignore(): void {}
