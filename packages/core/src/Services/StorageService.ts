export default abstract class StorageSerice {
  
  /**
   * Saves data in Storage.
   * 
   * @abstract
   * @param {string} key The key under which the data will be saved.
   * @param {T} data The data to be saved (in string format).
   * @param {number} [ttl] - Optional time-to-live in seconds. If provided, the key will expire after this time.
   */
  public abstract set<T = unknown>(key: string, data: T, ttl?: number): Promise<void>;

  /**
   * Get data from Storage.
   * 
   * @abstract
   * @param {string} key The key from which the data will be read.
   * @returns {Promise<T | undefined>} A promise that resolves to the parsed value of type `T` if the key exists
   * or `undefined` if the key is not found or the value is null/undefined.
   */
  public abstract get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Delete data from Storage.
   * 
   * @abstract
   * @param {string} key The key from which the data will be read.
   * @returns {Promise<void>} The data read from Storage (in string format).
   */
  public abstract delete(key: string): Promise<void>;

  /**
   * Resets the Storage by flushing all keys.
   * 
   * @abstract
   * @returns {Promise<void>} A promise that resolves when the Storage has been flushed.
   * This method clears all keys in the current Storage instance, effectively resetting the entire data store.
   */
  public abstract reset(): Promise<void>;

  /**
   * Checks if the storage contains a specific item.
   * 
   * @abstract
   * @param {string} key - The key of the item to check in the storage.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the item exists, otherwise `false`.
   */
    public abstract has(key: string): Promise<boolean>;
}