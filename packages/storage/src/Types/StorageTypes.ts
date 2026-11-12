/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { Storage } from '../Service/Storage';
import type { IOC } from '@vercube/di';

export namespace StorageTypes {
  export interface BaseOptions {
    storage?: string;
  }

  /**
   * The `health` option of a mount: `false` registers no check, an object
   * tunes the one it registers.
   * @default true
   */
  export type HealthOption = boolean | { critical?: boolean; timeout?: number };

  /** What the storage manager needs from `app.health`, injected without importing core. */
  export interface HealthRegistryLike {
    register(check: { name: string; critical?: boolean; timeout?: number; check: () => Promise<void> }): () => void;
  }

  export type Mount<T extends Storage<unknown>> = {
    name?: string;
    storage: IOC.Newable<T>;
    /**
     * Registers a readiness check, `storage:<name>`, when the driver talks to a
     * backend (S3). In-memory storage gets none.
     * @default true
     */
    health?: HealthOption;
  } & (T extends Storage<undefined> ? { initOptions?: unknown } : T extends Storage<infer U> ? { initOptions: U } : never);

  export interface Storages<T = unknown> {
    storage: Storage<T>;
    initOptions?: T;
  }

  export interface GetItem extends BaseOptions {
    key: string;
  }

  export interface GetItems extends BaseOptions {
    keys: string[];
  }

  export interface SetItem<T = unknown, U = unknown> extends BaseOptions {
    key: string;
    value: T;
    options?: U;
  }

  /**
   * Options of a write that can expire. Drivers that cannot expire keys
   * (S3) ignore `ttl`.
   */
  export interface WriteOptions {
    /** Seconds until the key expires. Missing or `0` keeps it forever. */
    ttl?: number;
  }

  /** Options of {@link Storage.increment}. */
  export interface IncrementOptions {
    /**
     * Amount added, may be negative.
     * @default 1
     */
    by?: number;
    /** Seconds until the counter expires, applied only when the increment creates it. */
    ttl?: number;
  }

  export interface Increment extends BaseOptions, IncrementOptions {
    key: string;
  }

  export interface DeleteItem extends BaseOptions {
    key: string;
  }

  export interface HasItem extends BaseOptions {
    key: string;
  }

  export interface GetKeys extends BaseOptions {}

  export interface Clear extends BaseOptions {}

  export interface Size extends BaseOptions {}

  /** One mounted storage, as reported by {@link StorageManager.describe}. */
  export interface MountDescription {
    /** Mount name, `default` unless another was given. */
    name: string;
    /** Driver class name, e.g. `MemoryStorage`. */
    driver: string;
    /** Number of stored items, or null when the driver could not be counted or counting would list the whole backend. */
    size: number | null;
    /** Keys currently held, capped; null when the driver cannot enumerate them. */
    keys: string[] | null;
    /** True when the key list was cut short by the cap. */
    truncated: boolean;
    /** True when the driver increments counters atomically, false when the manager falls back to a read and a write. */
    atomicIncrement: boolean;
  }

  /** What {@link StorageManager.describe} reports. */
  export interface Description {
    mounts: MountDescription[];
  }

  /** Options for {@link StorageManager.describe}. */
  export interface DescribeOptions {
    /**
     * Maximum keys listed per mount.
     *
     * @default 250
     */
    maxKeys?: number;
  }
}
