import type { CacheEntry, CacheOptions, CacheStatus } from 'ocache';

export namespace CacheTypes {
  /**
   * Name (or ordered list of names) of storages mounted in the {@link StorageManager}
   * that should back a cached function.
   *
   * When an array is given, reads try each storage in order (multi-tier: hit the fast
   * one first, fall back to the shared one) and writes go to all of them.
   *
   * When omitted, the `default` storage is used.
   */
  export type StorageRef = string | string[];

  /**
   * How a cached value was served on a given call.
   * - `hit` - a fresh cached value was returned without re-resolving
   * - `stale` - a stale value was served while a background SWR refresh runs
   * - `revalidated` - a prior value existed but was expired, so it was re-resolved in the foreground
   * - `miss` - the value was resolved fresh on this call
   */
  export type Status = CacheStatus;

  /**
   * A cache entry as it is stored, wrapping the cached value with its metadata.
   */
  export type Entry<T = unknown> = CacheEntry<T>;

  /**
   * Options accepted by {@link CacheManager.cached} and the `@Cache()` decorator.
   *
   * This is the ocache option set with the low level `base` and `storage` options
   * replaced by the Vercube native `storage` option - `base` is derived from it so
   * that cache keys can be routed to the right mounted storage, and the backend is
   * always the {@link CacheStorageAdapter} the CacheManager owns.
   */
  export type Options<T = any, ArgsT extends unknown[] = any[]> = Omit<CacheOptions<T, ArgsT>, 'base' | 'storage'> & {
    /** Storage (or storages, for multi-tier caching) mounted in StorageManager to keep entries in. */
    storage?: StorageRef;
  };

  /**
   * Application wide defaults applied to every cached function.
   * Per-call options always win over these.
   */
  export interface Defaults {
    /** Number of seconds an entry stays fresh. @default 1 */
    maxAge?: number;
    /** Serve a stale entry while refreshing it in the background. @default false */
    swr?: boolean;
    /** Maximum number of seconds a stale entry may be served while revalidating. */
    staleMaxAge?: number;
    /** Cache key group prefix. @default 'functions' */
    group?: string;
    /** Default storage (or storages) to keep entries in. */
    storage?: StorageRef;
    /** Called for every cache related error (read, write, background refresh). */
    onError?: (error: unknown) => void;
  }

  /**
   * A function wrapped with caching, augmented with on-demand revalidation helpers.
   */
  export type CachedFunction<T = unknown, ArgsT extends unknown[] = any[]> = {
    (...args: ArgsT): Promise<T>;
    /** Resolves every storage key (one per storage tier) the given arguments cache under. */
    resolveKeys: (...args: ArgsT) => Promise<string[]>;
    /** Removes cached entries for the given arguments from every storage tier. */
    invalidate: (...args: ArgsT) => Promise<void>;
    /** Marks cached entries as stale so the next access refreshes them. */
    expire: (...args: ArgsT) => Promise<void>;
  };

  /**
   * Options for the `@Cache()` decorator. Identical to {@link Options}, except that
   * `name` defaults to `ClassName.methodName` when it is not given.
   */
  export type DecoratorOptions<T = any, ArgsT extends unknown[] = any[]> = Options<T, ArgsT>;

  /**
   * A method wrapped by the `@Cache()` decorator, as seen from the outside.
   * Use it to type a cached method so its `.invalidate()` / `.expire()` helpers are visible.
   *
   * @example
   * ```ts
   * class UsersService {
   *   @Cache({ maxAge: 60 })
   *   public getUser!: CacheTypes.CachedMethod<[id: string], User>;
   * }
   * ```
   */
  export type CachedMethod<ArgsT extends unknown[] = any[], T = unknown> = CachedFunction<T, ArgsT>;
}
