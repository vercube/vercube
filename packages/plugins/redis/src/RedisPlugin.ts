import { App, BasePlugin } from '@cube/core';
import Redis from 'ioredis';
import type StorageSerice from '../../../core/src/Services/StorageService';

export interface RedisPluginOptions {
  port: number; // Redis port
  host: string; // Redis host
  username: string; // needs Redis >= 6
  password: string;
  db: number; // Defaults to 0
}

/**
 * RedisPlugin class that extends the Plugin class.
 */
export class RedisPlugin extends BasePlugin<RedisPluginOptions> implements StorageSerice {

  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'RedisPlugin';

  /**
   * @private
   * @type {Redis}
   * @description Redis connection object. It is initially set to `null` and created on the first connection request.
   */
  private fRedisClient!: Redis;

  /**
   * @private
   * @type {RedisPluginOptions}
   * @description Redis options object.
   */
  private fOptions!: RedisPluginOptions;

  /**
   * Method to use the plugin with the given app.
   *
   * @param {App} app - The application instance.
   * @param {RedisPluginOptions} options - The plugin custom options.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(app: App, options: RedisPluginOptions): void | Promise<void> {
    this.fOptions = options;
  }

  /**
   * Returns the Redis connection instance. If the connection does not exist, it attempts to create one.
   * 
   * @returns {Redis} - The Redis connection instance.
   * @throws {Error} - Logs an error if the connection cannot be established.
   */
  public getConnection(): Redis {
    if (!this.fRedisClient) {
      try {
        this.fRedisClient = new Redis(this.fOptions);
        console.log('Connecting to Redis at:', this.fOptions.host);
      } catch (e) {
        throw new Error(`Cannot be connected to redis ${e}`);
      }
    }

    return this.fRedisClient;
  }

  /**
   * Sets a value in the Redis store, optionally with a time-to-live (TTL).
   * 
   * @async
   * @param {string} key - The key to set in Redis.
   * @param {any} value - The value to be stored, which will be serialized to JSON.
   * @param {number} [ttl] - Optional time-to-live in seconds. If provided, the key will expire after this time.
   * @returns {Promise<void>} - A promise that resolves once the value has been set in Redis.
   */
  public async set(key: string, value: any, ttl?: number): Promise<void> {
    const val = JSON.stringify(value);

    if (ttl) {
      await this.fRedisClient.setex(key, ttl, val);
      return;
    }

    await this.fRedisClient.set(key, val);
  }

  /**
   * Deletes a key from the Redis store.
   * 
   * @async
   * @param {string} key - The key to be deleted from Redis.
   * @returns {Promise<void>} - A promise that resolves when the key has been deleted.
   */
  public async delete(key: string): Promise<void> {
    await this.fRedisClient.del(key);
  }

  /**
   * Retrieves and parses a value from Redis by the given key.
   * 
   * @async
   * @template T The expected type of the returned value. Defaults to `any`.
   * @param {string} key The Redis key to retrieve the value for.
   * @returns {Promise<T | undefined>} A promise that resolves to the parsed value of type `T` if the key exists, 
   * or `undefined` if the key is not found or the value is null/undefined.
   * 
   * @throws {SyntaxError} If the stored value is not valid JSON.
   */
  public async get<T = any>(key: string): Promise<T | undefined> {
    const val = await this.fRedisClient.get(key);

    if (val === undefined || val === null) {
      return undefined;
    }

    return JSON.parse(val) as T;
  }

  /**
   * Resets the Redis database by flushing all keys.
   * This method clears all keys in the current Redis instance, effectively resetting the entire data store.
   * 
   * @async
   * @returns {Promise<void>} A promise that resolves when the Redis database has been flushed.
   */
  public async reset(): Promise<void> {
    await this.fRedisClient.flushall();
  }

  /**
   * Checks if the storage contains a specific item identified by the given key in the Redis store.
   * 
   * @async
   * @param {string} key - The key of the item to check in the Redis store.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the item exists, otherwise `false`.
   */
  public async has(key: string): Promise<boolean> {
    const value = await this.get(key);

    return Boolean(value);
  }

}
