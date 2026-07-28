import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { CacheError } from '../Errors/CacheError';
import type { Storage } from '@vercube/storage';
import type { StorageInterface } from 'ocache';

/**
 * Prefix every cache key starts with. The segment that follows it (when present)
 * is the name of the storage mounted in {@link StorageManager} that backs the entry.
 *
 * ocache builds keys as `<base>:<group>:<name>:<key>.json`, so the base is always
 * the first colon separated segment and can be parsed back out on read/write.
 */
export const CACHE_BASE_PREFIX = '/cache';

/**
 * Builds the cache key base for a storage mounted in {@link StorageManager}.
 *
 * @param {string} [storage] - Name of the mounted storage, `default` when omitted
 * @returns {string} The base prefix cache keys for that storage start with
 */
export function cacheBaseForStorage(storage?: string): string {
  if (storage?.includes(':')) {
    // the base is read back by splitting on the first colon, so a colon in the
    // name would silently resolve to a different (or non-existent) storage
    throw new CacheError('Storage name used for caching must not contain a colon', 'cacheBaseForStorage', undefined, {
      storage,
    });
  }

  return storage && storage !== 'default' ? `${CACHE_BASE_PREFIX}/${storage}` : CACHE_BASE_PREFIX;
}

/**
 * Extracts the mounted storage name back out of a full cache key.
 *
 * @param {string} key - A cache key produced by the caching engine
 * @returns {string} Name of the storage the key belongs to, `default` when the key carries no storage segment
 */
export function storageNameFromCacheKey(key: string): string {
  const separatorIndex = key.indexOf(':');
  const base = separatorIndex === -1 ? key : key.slice(0, separatorIndex);

  if (!base.startsWith(`${CACHE_BASE_PREFIX}/`)) {
    return 'default';
  }

  return base.slice(CACHE_BASE_PREFIX.length + 1) || 'default';
}

/**
 * Bridges the caching engine onto the Vercube {@link StorageManager}.
 *
 * The cache module owns no storage of its own - every entry lives in a storage
 * mounted in `@vercube/storage`, so a cache can be backed by memory, S3 or any
 * other driver simply by mounting it, and the very same entries are visible
 * through the regular storage API.
 *
 * Every cache key carries the name of the storage it belongs to in its base
 * segment, so a single adapter instance serves cached functions that live in
 * different storages - and even ones that span several of them at once.
 *
 * A cached function may point at a storage that has not been mounted; in that
 * case a {@link MemoryStorage} is mounted under that name on first use so that
 * caching works with zero configuration. Mounting the name yourself - before or
 * after - is what swaps the backend for a real one.
 */
export class CacheStorageAdapter implements StorageInterface {
  /** Storage manager holding every mounted storage */
  @InjectOptional(StorageManager)
  protected gStorageManager!: StorageManager | null;

  /** Logger instance */
  @InjectOptional(Logger)
  protected gLogger!: Logger | null;

  /** In-flight auto-mounts, keyed by storage name, so concurrent calls share one storage */
  protected fMounting: Map<string, Promise<Storage>> = new Map();

  /**
   * Reads a cache entry from the storage its key points at.
   *
   * @template T - Type of the stored entry
   * @param {string} key - Full cache key, including the storage base prefix
   * @returns {Promise<T | null>} The stored entry, or null when it is absent
   */
  public async get<T = unknown>(key: string): Promise<T | null> {
    const storage = await this.resolveStorage(key);
    return (await storage.getItem<T>(key)) ?? null;
  }

  /**
   * Writes a cache entry to the storage its key points at.
   *
   * The caching engine signals a deletion by writing `null`, which is mapped onto
   * the storage's delete operation so that no empty entries are left behind.
   *
   * @template T - Type of the value to store
   * @param {string} key - Full cache key, including the storage base prefix
   * @param {T} value - Entry to store, or null to remove it
   * @param {{ ttl?: number }} [opts] - Storage hints, `ttl` in seconds
   * @returns {Promise<void>} Resolves once the write is complete
   */
  public async set<T = unknown>(key: string, value: T, opts?: { ttl?: number }): Promise<void> {
    const storage = await this.resolveStorage(key);

    if (value === null || value === undefined) {
      await storage.deleteItem(key);
      return;
    }

    await storage.setItem<T, { ttl?: number }>(key, value, opts);
  }

  /**
   * Resolves the mounted storage a cache key belongs to, mounting an in-memory
   * one under that name when nothing has been mounted yet.
   *
   * @param {string} key - Full cache key, including the storage base prefix
   * @returns {Promise<Storage>} The storage backing that key
   * @protected
   */
  protected async resolveStorage(key: string): Promise<Storage> {
    const manager = this.gStorageManager;

    if (!manager) {
      throw new CacheError(
        'StorageManager is not registered in the container - bind it so cached entries have a storage to live in',
        'resolveStorage',
        undefined,
        { key },
      );
    }

    const name = storageNameFromCacheKey(key);

    return manager.getStorage(name) ?? (await this.mountFallback(manager, name));
  }

  /**
   * Mounts an in-memory storage under the given name, so that a cached function
   * pointing at a storage nobody mounted still works.
   *
   * @param {StorageManager} manager - Storage manager to mount into
   * @param {string} name - Name of the storage to mount
   * @returns {Promise<Storage>} The freshly mounted storage
   * @protected
   */
  protected async mountFallback(manager: StorageManager, name: string): Promise<Storage> {
    const pending = this.fMounting.get(name);

    if (pending) {
      return pending;
    }

    const mounting = (async () => {
      await manager.mount({ name, storage: MemoryStorage });

      const storage = manager.getStorage(name);

      if (!storage) {
        throw new CacheError('Unable to mount a fallback cache storage', 'mountFallback', undefined, { storage: name });
      }

      // mount() does not initialize, that only happens for storages present at container flush
      await storage.initialize(undefined);

      this.gLogger?.warn(
        `Vercube/CacheStorageAdapter::storage "${name}" was not mounted, an in-memory one has been mounted automatically`,
      );

      return storage;
    })();

    this.fMounting.set(name, mounting);

    // drop the entry once it settles: a mounted storage is found through the manager
    // from then on, and a failed mount must stay retryable instead of being cached
    void mounting
      .catch(() => undefined)
      .finally(() => {
        if (this.fMounting.get(name) === mounting) {
          this.fMounting.delete(name);
        }
      });

    return mounting;
  }
}
