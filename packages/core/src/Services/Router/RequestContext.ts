import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Store held by {@link AsyncLocalStorage} for the duration of one request.
 *
 * The backing map is created on first write: most requests never touch the
 * context, so allocating a `Map` for every one of them is pure overhead.
 */
interface RequestContextStore {
  map: Map<string, unknown> | null;
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
    return this.fStorage.run({ map: null }, fn);
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

    (store.map ??= new Map<string, unknown>()).set(key, value);
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

    return store.map?.get(key) as T | undefined;
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
    return this.fStorage.getStore()?.map?.has(key) ?? false;
  }

  /**
   * Gets all keys in the current request context.
   *
   * @returns Array of keys in the context
   */
  public keys(): string[] {
    const map = this.fStorage.getStore()?.map;
    return map ? [...map.keys()] : [];
  }

  /**
   * Gets all values in the current request context.
   *
   * @returns Map of all key-value pairs in the context
   */
  public getAll(): Map<string, unknown> {
    const map = this.fStorage.getStore()?.map;
    return map ? new Map(map) : new Map();
  }
}
