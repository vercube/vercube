import { Storage } from '../Service/Storage';
import type { StorageTypes } from '../Types/StorageTypes';

/** A stored value and the time it expires at, in epoch milliseconds. */
interface Entry {
  value: unknown;
  expiresAt?: number;
}

/** Least time between two sweeps of expired entries, in milliseconds. */
const SWEEP_INTERVAL = 5000;

/**
 * In-memory storage implementation of the Storage interface
 * Provides a simple key-value store that persists only for the duration of the application runtime
 * Useful for testing, caching, and scenarios where temporary storage is needed
 *
 * Honours `{ ttl }` (seconds) on `setItem` and `increment`. An expired entry is
 * dropped when it is read, and every few seconds a write sweeps the rest, so
 * keys nobody reads again (one per client and time window, say) do not pile up.
 * There is no timer: nothing keeps the process alive.
 *
 * @implements {Storage}
 */
export class MemoryStorage implements Storage {
  /** Internal storage map to hold key-value pairs */
  private storage: Map<string, Entry> = new Map();

  /** When expired entries were last swept, in epoch milliseconds */
  private lastSweep: number = 0;

  /**
   * Initializes the memory storage
   * No initialization is needed for in-memory storage as the Map is created on instantiation
   */
  public initialize(): void {
    // No initialization needed for memory storage
  }

  /**
   * Retrieves a value from memory storage by its key
   * @template T - Type of the stored value
   * @param {string} key - The key to retrieve the value for
   * @returns {T} The stored value cast to type T
   */
  public getItem<T = unknown>(key: string): T {
    return this.live(key)?.value as T;
  }

  /**
   * Retrieves multiple items from memory storage by their keys
   * @template T - Type of the stored value
   * @param {string[]} keys - The keys to retrieve the values for
   * @returns {T[]} Array of stored values, with undefined for missing keys
   */
  public getItems<T = unknown>(keys: string[]): T[] {
    return keys.map((key) => this.live(key)?.value as T);
  }

  /**
   * Stores a value in memory storage with the specified key
   * @template T - Type of the value to store
   * @template U - Type of the options object
   * @param {string} key - The key under which to store the value
   * @param {T} value - The value to store
   * @param {U} [options] - `{ ttl }` in seconds expires the value
   */
  public setItem<T = unknown, U = StorageTypes.WriteOptions>(key: string, value: T, options?: U): void {
    this.sweep();

    if (value === undefined) {
      this.storage.delete(key);
      return;
    }

    this.storage.set(key, { value, expiresAt: expiry((options as StorageTypes.WriteOptions | undefined)?.ttl) });
  }

  /**
   * Adds to a numeric counter and returns the new value. A missing, expired or
   * non-numeric entry starts from zero; `ttl` only applies when the counter is created.
   * @param {string} key - The counter key
   * @param {StorageTypes.IncrementOptions} [options] - Step and expiry
   * @returns {number} The value after the increment
   */
  public increment(key: string, options: StorageTypes.IncrementOptions = {}): number {
    this.sweep();

    const entry = this.live(key);
    const current = typeof entry?.value === 'number' ? entry.value : 0;
    const value = current + (options.by ?? 1);

    if (entry && typeof entry.value === 'number') {
      entry.value = value;
    } else {
      this.storage.set(key, { value, expiresAt: expiry(options.ttl) });
    }

    return value;
  }

  /**
   * Removes a value from memory storage by its key
   * @param {string} key - The key of the value to delete
   */
  public deleteItem(key: string): void {
    this.storage.delete(key);
  }

  /**
   * Checks if a value exists in memory storage for the given key
   * @param {string} key - The key to check
   * @returns {boolean} True if the key exists, false otherwise
   */
  public hasItem(key: string): boolean {
    return this.live(key) !== undefined;
  }

  /**
   * Retrieves all keys currently stored in memory storage
   * @returns {string[]} Array of all stored keys
   */
  public getKeys(): string[] {
    this.sweep(true);
    return [...this.storage.keys()];
  }

  /**
   * Removes all stored values from memory storage
   */
  public clear(): void {
    this.storage.clear();
  }

  /**
   * Gets the number of key-value pairs stored in memory storage
   * @returns {number} The number of stored items
   */
  public size(): number {
    this.sweep(true);
    return this.storage.size;
  }

  /**
   * Returns an entry that has not expired, dropping it when it has.
   * @param {string} key - The key to look up
   * @returns {Entry | undefined} The entry, or undefined when missing or expired
   */
  private live(key: string): Entry | undefined {
    const entry = this.storage.get(key);

    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.storage.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Drops every expired entry, at most once per {@link SWEEP_INTERVAL} unless forced.
   * @param {boolean} [force] - Sweep regardless of when the last sweep ran
   */
  private sweep(force: boolean = false): void {
    const now = Date.now();

    if (!force && now - this.lastSweep < SWEEP_INTERVAL) {
      return;
    }

    this.lastSweep = now;

    for (const [key, entry] of this.storage) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.storage.delete(key);
      }
    }
  }
}

/**
 * Turns a TTL in seconds into an expiry time.
 * @param {number} [ttl] - Seconds until expiry, none when missing or not positive
 * @returns {number | undefined} Epoch milliseconds, or undefined for no expiry
 */
function expiry(ttl?: number): number | undefined {
  return typeof ttl === 'number' && ttl > 0 ? Date.now() + ttl * 1000 : undefined;
}
