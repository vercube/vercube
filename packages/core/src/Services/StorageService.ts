export default abstract class StorageSerice {
  /**
   * Saves data in Storage.
   * @param key The key under which the data will be saved.
   * @param data The data to be saved (in string format).
   * @param {number} [ttl] - Optional time-to-live in seconds. If provided, the key will expire after this time.
   */
  public abstract set(key: string, data: string, ttl?: number): Promise<void>;

  /**
   * Get data from Storage.
   * @param key The key from which the data will be read.
   * @returns The data read from Storage (in string format).
   */
  public abstract get(key: string): Promise<void>;

  
  /**
   * Delete data from Storage.
   * @param key The key from which the data will be read.
   * @returns The data read from Storage (in string format).
   */
  public abstract delete(key: string): Promise<void>;
}