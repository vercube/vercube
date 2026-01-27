/**
 * Abstract base class for storage implementations
 * Provides a common interface for different storage providers
 *
 * @abstract
 * @class Storage
 * @description
 * The Storage class defines a standard interface for storing and retrieving data.
 * It supports basic operations like get, set, delete, and querying storage state.
 * Concrete implementations must provide the actual storage mechanism.
 */
export abstract class Storage<InitOptions = undefined> {
  /**
   * Initializes the storage implementation.
   * Must be called before using any other storage operations.
   *
   * @param {InitOptions} options - Initialization parameters. May be omitted if not required by the storage implementation.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public abstract initialize(options: InitOptions): void | Promise<void>;

  /**
   * Retrieves a value from storage by its key
   * @template T - The type of the stored value
   * @param {string} key - The key to retrieve the value for
   * @returns {Promise<T>} A promise that resolves with the stored value
   */
  public abstract getItem<T = unknown>(key: string): T | Promise<T>;

  /**
   * Stores a value in storage with the specified key
   * @template T - The type of the value to store
   * @template U - The type of the optional options object
   * @param {string} key - The key under which to store the value
   * @param {T} value - The value to store
   * @returns {Promise<void>} A promise that resolves when the value is stored
   */
  public abstract setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void | Promise<void>;

  /**
   * Removes a value from storage by its key
   * @param {string} key - The key of the value to delete
   * @returns {Promise<void>} A promise that resolves when the value is deleted
   */
  public abstract deleteItem(key: string): void | Promise<void>;

  /**
   * Checks if a value exists in storage for the given key
   * @param {string} key - The key to check
   * @returns {Promise<boolean>} A promise that resolves to true if the key exists, false otherwise
   */
  public abstract hasItem(key: string): boolean | Promise<boolean>;

  /**
   * Retrieves all keys currently stored in storage
   * @returns {Promise<string[]>} A promise that resolves with an array of all stored keys
   */
  public abstract getKeys(): string[] | Promise<string[]>;

  /**
   * Removes all stored values from storage
   * @returns {Promise<void>} A promise that resolves when all values are cleared
   */
  public abstract clear(): void | Promise<void>;

  /**
   * Gets the number of key-value pairs stored in storage
   * @returns {Promise<number>} A promise that resolves with the number of stored items
   */
  public abstract size(): number | Promise<number>;
}
