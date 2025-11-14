import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request context storage using AsyncLocalStorage.
 * This allows storing request-specific data that is automatically cleaned up after the request completes.
 */
export class RequestContext {
  /** The storage for the request context */
  private readonly fStorage: AsyncLocalStorage<Map<string, unknown>>;

  /**
   * Initializes the request storage.
   */
  constructor() {
    this.fStorage = new AsyncLocalStorage<Map<string, unknown>>();
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
   * @param fn - The function to run within the context
   * @returns The result of the function
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    const context = new Map<string, unknown>();
    // AsyncLocalStorage automatically cleans up the context when fn() completes
    return this.fStorage.run(context, fn);
  }

  /**
   * Sets a value in the current request context.
   *
   * @param key - The key to store the value under
   * @param value - The value to store
   * @throws Error if called outside of a request context
   */
  public set(key: string, value: unknown): void {
    const context = this.fStorage.getStore();

    if (!context) {
      throw new Error(
        'RequestContext.set() called outside of request context. The context is automatically initialized by RequestHandler.',
      );
    }

    context.set(key, value);
  }

  /**
   * Gets a value from the current request context.
   *
   * @param key - The key to retrieve
   * @returns The value if found, undefined otherwise
   * @throws Error if called outside of a request context
   */
  public get<T = unknown>(key: string): T | undefined {
    const context = this.fStorage.getStore();

    if (!context) {
      throw new Error(
        'RequestContext.get() called outside of request context. The context is automatically initialized by RequestHandler.',
      );
    }

    return context.get(key) as T | undefined;
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
    const context = this.fStorage.getStore();

    if (!context) {
      return false;
    }

    return context.has(key);
  }

  /**
   * Gets all keys in the current request context.
   *
   * @returns Array of keys in the context
   */
  public keys(): string[] {
    const context = this.fStorage.getStore();

    if (!context) {
      return [];
    }

    return [...context.keys()];
  }

  /**
   * Gets all values in the current request context.
   *
   * @returns Map of all key-value pairs in the context
   */
  public getAll(): Map<string, unknown> {
    const context = this.fStorage.getStore();

    if (!context) {
      return new Map();
    }

    return new Map(context);
  }
}
