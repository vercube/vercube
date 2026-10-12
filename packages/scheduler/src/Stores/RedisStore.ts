import { Redis } from 'ioredis';
import { SchedulerError } from '../Errors/SchedulerError';
import { SchedulerStore } from '../Services/SchedulerStore';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { Cluster } from 'ioredis';

/** Options of the {@link RedisStore}. */
export interface RedisStoreOptions {
  /**
   * Connection URL, such as `redis://localhost:6379`. Ignored when `client` is given.
   * @default 'redis://127.0.0.1:6379'
   */
  url?: string;

  /**
   * An existing client, for example the one BullMQ already uses. The store never
   * closes a client it was given.
   */
  client?: Redis | Cluster;

  /**
   * Prefix of every key the store writes.
   * @default 'vercube:scheduler'
   */
  prefix?: string;
}

/** Extends a key only while it still holds the expected owner. */
const EXTEND_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;

/** Deletes a key only while it still holds the expected owner. */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** State fields holding numbers. */
const NUMERIC_FIELDS = ['lastScheduledAt', 'lastStartedAt', 'lastFinishedAt'] as const;

/**
 * Store keeping claims and state in Redis.
 *
 * A claim is a plain key created with `SET NX PX`, extended and released by
 * scripts that check the owner first, so a replica can never touch a claim it
 * lost. Every operation touches a single key, which keeps Redis Cluster working
 * without hash tags.
 *
 * Requires the optional `ioredis` dependency.
 *
 * @example
 * ```ts
 * import { RedisStore } from '@vercube/scheduler/stores/RedisStore';
 *
 * app.addPlugin(SchedulerPlugin, {
 *   store: { store: RedisStore, initOptions: { url: process.env.REDIS_URL, prefix: 'myapp' } },
 * });
 * ```
 */
export class RedisStore extends SchedulerStore<RedisStoreOptions | undefined> {
  /** @inheritdoc */
  public readonly name: string = 'redis';

  /** Client the store talks to */
  private fClient: Redis | Cluster | null = null;

  /** Whether the store created the client, and therefore has to close it */
  private fOwnsClient: boolean = false;

  /** Prefix of every key */
  private fPrefix: string = 'vercube:scheduler';

  /** @inheritdoc */
  public override get capabilities(): SchedulerTypes.StoreCapabilities {
    return { distributed: true };
  }

  /** @inheritdoc */
  public async initialize(options?: RedisStoreOptions): Promise<void> {
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
      // the manager retries initialization, so a failed client must not linger
      client.disconnect();

      throw error;
    }

    this.fClient = client;
    this.fOwnsClient = true;
  }

  /** @inheritdoc */
  public async claim(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return (await this.client.set(this.key(key), owner, 'PX', Math.ceil(ttlMs), 'NX')) === 'OK';
  }

  /** @inheritdoc */
  public async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return Number(await this.client.eval(EXTEND_SCRIPT, 1, this.key(key), owner, Math.ceil(ttlMs))) === 1;
  }

  /** @inheritdoc */
  public async release(key: string, owner: string): Promise<boolean> {
    return Number(await this.client.eval(RELEASE_SCRIPT, 1, this.key(key), owner)) === 1;
  }

  /** @inheritdoc */
  public async getState(job: string): Promise<SchedulerTypes.JobState | null> {
    const fields = await this.client.hgetall(this.key(`state:${job}`));

    if (!fields || !fields.lastScheduledAt) {
      return null;
    }

    const state: Record<string, unknown> = { ...fields };

    for (const field of NUMERIC_FIELDS) {
      if (fields[field] !== undefined) {
        state[field] = Number(fields[field]);
      }
    }

    return state as unknown as SchedulerTypes.JobState;
  }

  /** @inheritdoc */
  public async setState(job: string, state: SchedulerTypes.JobState): Promise<void> {
    const key = this.key(`state:${job}`);
    const fields: Record<string, string> = {};

    for (const [field, value] of Object.entries(state)) {
      if (value !== undefined) {
        fields[field] = String(value);
      }
    }

    // replaced as a whole, so a field the new state leaves out does not linger
    await this.client.multi().del(key).hset(key, fields).exec();
  }

  /** @inheritdoc */
  public async close(): Promise<void> {
    const client = this.fClient;

    this.fClient = null;

    if (client && this.fOwnsClient) {
      await client.quit();
    }
  }

  /**
   * The client, once the store is initialized.
   *
   * @returns The Redis client
   * @throws {SchedulerError} When the store is used before it was initialized
   */
  private get client(): Redis | Cluster {
    if (!this.fClient) {
      throw new SchedulerError('RedisStore is not initialized', 'store', undefined, undefined, false);
    }

    return this.fClient;
  }

  /**
   * Prefixes a key.
   *
   * @param key - Key without prefix
   * @returns The key as stored in Redis
   */
  private key(key: string): string {
    return `${this.fPrefix}:${key}`;
  }
}
