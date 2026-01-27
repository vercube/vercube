/* eslint-disable @typescript-eslint/no-unused-vars */
import { Storage } from '../Service/Storage';

/**
 * In-memory storage implementation of the Storage interface
 * Provides a simple key-value store that persists only for the duration of the application runtime
 * Useful for testing, caching, and scenarios where temporary storage is needed
 *
 * @implements {Storage}
 */
export class MemoryStorage implements Storage {
  /** Internal storage map to hold key-value pairs */
  private storage: Map<string, unknown> = new Map();

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
    return this.storage.get(key) as T;
  }

  /**
   * Retrieves multiple items from memory storage by their keys
   * @template T - Type of the stored value
   * @param {string[]} keys - The keys to retrieve the values for
   * @returns {T[]} Array of stored values, with undefined for missing keys
   */
  public getItems<T = unknown>(keys: string[]): T[] {
    return keys.map((key) => this.storage.get(key) as T);
  }

  /**
   * Stores a value in memory storage with the specified key
   * @template T - Type of the value to store
   * @template U - Type of the options object
   * @param {string} key - The key under which to store the value
   * @param {T} value - The value to store
   */
  public setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void {
    this.storage.set(key, value);
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
    return this.storage.has(key);
  }

  /**
   * Retrieves all keys currently stored in memory storage
   * @returns {string[]} Array of all stored keys
   */
  public getKeys(): string[] {
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
    return this.storage.size;
  }
}
