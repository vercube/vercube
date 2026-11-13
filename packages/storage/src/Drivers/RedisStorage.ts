import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { StorageError } from '../Errors/StorageError';
import { Storage } from '../Service/Storage';
import type { StorageTypes } from '../Types/StorageTypes';
import type { Cluster } from 'ioredis';

/** Options of the {@link RedisStorage}. */
export interface RedisStorageOptions {
  /**
   * Connection URL, such as `redis://localhost:6379`. Ignored when `client` is given.
   * @default 'redis://127.0.0.1:6379'
   */
  url?: string;

  /**
   * An existing client, for example the one BullMQ or the scheduler already
   * uses. The storage never closes a client it was given.
   */
  client?: Redis | Cluster;

  /**
   * Prefix of every key the storage writes. `clear()`, `getKeys()` and `size()`
   * only ever touch keys under it.
   * @default 'vercube:storage'
   */
  prefix?: string;
}

/**
 * Increments a counter and gives it an expiry when it has none, in one round
 * trip, so a crash between the two steps can never leave a counter that lives
 * forever. A value that is not a number starts over from zero, like in memory.
 * `INCRBYFLOAT` keeps fractional steps, and is exact for whole numbers.
 */
const INCREMENT_SCRIPT = `local current = redis.call('get', KEYS[1])
if current and not tonumber(current) then redis.call('del', KEYS[1]) end
local value = redis.call('incrbyfloat', KEYS[1], ARGV[1])
if tonumber(ARGV[2]) > 0 and redis.call('pttl', KEYS[1]) == -1 then redis.call('pexpire', KEYS[1], ARGV[2]) end
return value`;

/** SHA1 of the increment script, so a call sends 40 bytes instead of the script. */
const INCREMENT_SHA = createHash('sha1').update(INCREMENT_SCRIPT).digest('hex');

/** Keys fetched per SCAN round trip. */
const SCAN_COUNT = 500;

/**
 * Storage keeping values in Redis, shared by every instance of the application.
 *
 * Values are stored as JSON. `setItem` honours `{ ttl }` in seconds, and
 * `increment` is atomic, which is what makes counters (rate limits, quotas)
 * correct across instances. Every key lives under `prefix`, and the listing
 * operations never look outside it, so `clear()` cannot wipe data the storage
 * does not own.
 *
 * Requires the optional `ioredis` dependency.
 *
 * @example
 * ```ts
 * import { RedisStorage } from '@vercube/storage/drivers/RedisStorage';
 *
 * await container.get(StorageManager).mount({
 *   name: 'redis',
 *   storage: RedisStorage,
 *   initOptions: { url: process.env.REDIS_URL, prefix: 'myapp' },
 * });
 * ```
 */
export class RedisStorage implements Storage<RedisStorageOptions | undefined> {
  /** Counting keys means scanning the whole prefix */
  public readonly cheapSize: boolean = false;

  /** Client the storage talks to */
  private fClient: Redis | Cluster | null = null;

  /** Whether the storage created the client, and therefore has to close it */
  private fOwnsClient: boolean = false;

  /** Prefix of every key */
  private fPrefix: string = 'vercube:storage';

  /**
   * Connects to Redis, or adopts the client it was given.
   * @param {RedisStorageOptions} [options] - Connection options
   * @returns {Promise<void>} Resolves once connected
   */
  public async initialize(options?: RedisStorageOptions): Promise<void> {
    this.fPrefix = options?.prefix ?? this.fPrefix;

    if (options?.client) {
      this.fClient = options.client;
      this.fOwnsClient = false;

      return;
    }

    const client = new Redis(options?.url ?? 'redis://127.0.0.1:6379', { lazyConnect: true });

    try {
      await client.connect();
    } catch (error) {
      // a failed client must not keep reconnecting in the background
      client.disconnect();

      throw error;
    }

    this.fClient = client;
    this.fOwnsClient = true;
  }

  /**
   * The client, once the storage is initialized. Use it for what the storage
   * interface does not cover.
   * @returns {Redis | Cluster} The Redis client
   * @throws {StorageError} When the storage is used before it was initialized
   */
  public get client(): Redis | Cluster {
    if (!this.fClient) {
      throw new StorageError('RedisStorage is not initialized', 'client');
    }

    return this.fClient;
  }

  /**
   * Reads a value.
   * @param {string} key - The key
   * @returns {Promise<T | null>} The value, or null when missing
   */
  public async getItem<T = unknown>(key: string): Promise<T | null> {
    return decode<T>(await this.client.get(this.key(key)));
  }

  /**
   * Reads several values in one round trip.
   * @param {string[]} keys - The keys
   * @returns {Promise<T[]>} The values, null for a missing key
   */
  public async getItems<T = unknown>(keys: string[]): Promise<T[]> {
    if (keys.length === 0) {
      return [];
    }

    const client = this.client;
    const prefixed = keys.map((key) => this.key(key));

    // a cluster refuses MGET across slots, so it gets one GET per key
    const values = isCluster(client) ? await Promise.all(prefixed.map((key) => client.get(key))) : await client.mget(...prefixed);

    return values.map((value) => decode<T>(value) as T);
  }

  /**
   * Writes a value as JSON. `undefined` deletes the key.
   * @param {string} key - The key
   * @param {T} value - The value
   * @param {U} [options] - `{ ttl }` in seconds expires the value
   * @returns {Promise<void>} Resolves once written
   */
  public async setItem<T = unknown, U = StorageTypes.WriteOptions>(key: string, value: T, options?: U): Promise<void> {
    if (value === undefined) {
      await this.deleteItem(key);
      return;
    }

    const ttl = (options as StorageTypes.WriteOptions | undefined)?.ttl;
    const payload = JSON.stringify(value);

    if (typeof ttl === 'number' && ttl > 0) {
      await this.client.set(this.key(key), payload, 'PX', Math.ceil(ttl * 1000));
    } else {
      await this.client.set(this.key(key), payload);
    }
  }

  /**
   * Adds to a counter atomically, setting the expiry in the same round trip
   * when the counter has none. The script is sent once, then called by its SHA.
   * @param {string} key - The counter key
   * @param {StorageTypes.IncrementOptions} [options] - Step and expiry
   * @returns {Promise<number>} The value after the increment
   */
  public async increment(key: string, options: StorageTypes.IncrementOptions = {}): Promise<number> {
    const ttl = typeof options.ttl === 'number' && options.ttl > 0 ? Math.ceil(options.ttl * 1000) : 0;

    const args = [1, this.key(key), options.by ?? 1, ttl] as const;

    try {
      return Number(await this.client.evalsha(INCREMENT_SHA, ...args));
    } catch (error) {
      // the server has not seen the script yet, or restarted since
      if (!String((error as Error)?.message).includes('NOSCRIPT')) {
        throw error;
      }

      return Number(await this.client.eval(INCREMENT_SCRIPT, ...args));
    }
  }

  /**
   * Deletes a value.
   * @param {string} key - The key
   * @returns {Promise<void>} Resolves once deleted
   */
  public async deleteItem(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  /**
   * Tells whether a key exists.
   * @param {string} key - The key
   * @returns {Promise<boolean>} True when it exists
   */
  public async hasItem(key: string): Promise<boolean> {
    return (await this.client.exists(this.key(key))) > 0;
  }

  /**
   * Lists the keys under the prefix, without it.
   * @param {object} [options] - Listing options
   * @param {number} [options.limit] - Stop after this many keys
   * @returns {Promise<string[]>} The keys
   */
  public async getKeys(options: { limit?: number } = {}): Promise<string[]> {
    const keys: string[] = [];
    const start = this.fPrefix.length + 1;

    await this.scan((batch) => {
      for (const key of batch) {
        keys.push(key.slice(start));

        if (options.limit !== undefined && keys.length >= options.limit) {
          return false;
        }
      }

      return true;
    });

    return keys;
  }

  /**
   * Deletes every key under the prefix. Keys outside it are never touched.
   * @returns {Promise<void>} Resolves once deleted
   */
  public async clear(): Promise<void> {
    const keys: string[] = [];

    // listed first, deleted after: the cursor never walks a keyspace that shrinks under it
    await this.scan((batch) => {
      keys.push(...batch);
      return true;
    });

    // one key per DEL keeps Redis Cluster working without hash tags, and a
    // bounded batch keeps a large prefix from flooding the connection
    for (let start = 0; start < keys.length; start += SCAN_COUNT) {
      await Promise.all(keys.slice(start, start + SCAN_COUNT).map((key) => this.client.del(key)));
    }
  }

  /**
   * Counts the keys under the prefix by scanning it.
   * @returns {Promise<number>} The number of keys
   */
  public async size(): Promise<number> {
    let size = 0;

    await this.scan((batch) => {
      size += batch.length;
      return true;
    });

    return size;
  }

  /**
   * Checks that Redis answers.
   * @returns {Promise<void>} Resolves once it did
   */
  public async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Closes the connection the storage opened. A client it was given stays open.
   * @returns {Promise<void>} Resolves once closed
   */
  public async close(): Promise<void> {
    const client = this.fClient;

    this.fClient = null;

    if (client && this.fOwnsClient) {
      await client.quit();
    }
  }

  /**
   * Walks every key under the prefix once, on every master of a cluster.
   * @param {Function} visit - Receives each batch of full keys, returns false to stop
   * @returns {Promise<void>} Resolves once walked or stopped
   */
  private async scan(visit: (keys: string[]) => boolean): Promise<void> {
    const client = this.client;
    // SCAN may return a key twice, every caller wants it once
    const seen = new Set<string>();
    const nodes: Redis[] = isCluster(client) ? client.nodes('master') : [client];
    const match = `${escapeGlob(this.fPrefix)}:*`;

    for (const node of nodes) {
      let cursor = '0';

      do {
        const [next, found] = await node.scan(cursor, 'MATCH', match, 'COUNT', SCAN_COUNT);
        const keys = found.filter((key) => !seen.has(key) && seen.add(key));

        cursor = next;

        if (keys.length > 0 && !visit(keys)) {
          return;
        }
      } while (cursor !== '0');
    }
  }

  /**
   * Prefixes a key.
   * @param {string} key - Key without prefix
   * @returns {string} The key as stored in Redis
   */
  private key(key: string): string {
    return `${this.fPrefix}:${key}`;
  }
}

/**
 * Parses a stored value. A value that is not JSON (written by another client)
 * comes back as the raw string.
 * @param {string | null} raw - What Redis returned
 * @returns {T | null} The value, or null when missing
 */
function decode<T>(raw: string | null): T | null {
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

/**
 * Escapes the glob characters of a SCAN pattern.
 * @param {string} value - Literal text
 * @returns {string} The text, matched literally
 */
function escapeGlob(value: string): string {
  return value.replaceAll(/[*?[\]\\]/g, String.raw`\$&`);
}

/**
 * Tells a cluster client from a single-node one.
 * @param {Redis | Cluster} client - The client
 * @returns {boolean} True for a cluster
 */
function isCluster(client: Redis | Cluster): client is Cluster {
  return 'nodes' in client && typeof client.nodes === 'function';
}
