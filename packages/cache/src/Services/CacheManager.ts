import { Container, Init, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { defineCachedFunction, expireCache, invalidateCache, resolveCacheKeys, setStorage, useStorage } from 'ocache';
import { CacheError } from '../Errors/CacheError';
import { cacheBaseForStorage, CacheStorageAdapter } from './CacheStorageAdapter';
import type { CacheTypes } from '../Types/CacheTypes';
import type { CacheOptions } from 'ocache';

/**
 * Central entry point of the cache module.
 *
 * The CacheManager owns the wiring between the caching engine and the storages
 * mounted in `@vercube/storage`, holds the application wide defaults and exposes
 * the imperative API used both directly and by the `@Cache()` decorator.
 *
 * @example
 * ```ts
 * container.bind(CacheManager);
 *
 * const cache = container.get(CacheManager);
 * cache.configure({ maxAge: 60, swr: true, staleMaxAge: 300, storage: 'cache' });
 *
 * const getUser = cache.cached((id: string) => db.users.find(id), { name: 'getUser' });
 *
 * await getUser('123');            // resolves and stores
 * await getUser('123');            // served from cache
 * await getUser.invalidate('123'); // drops the entry
 * ```
 */
export class CacheManager {
  /** Container instance */
  @Inject(Container)
  protected gContainer!: Container;

  /** Logger instance */
  @InjectOptional(Logger)
  protected gLogger!: Logger | null;

  /** Application wide defaults applied to every cached function */
  protected fDefaults: CacheTypes.Defaults = {};

  /** Storage adapter bridging the caching engine onto the mounted storages */
  protected fAdapter: CacheStorageAdapter | null = null;

  /**
   * Returns the storage adapter this manager installed into the caching engine.
   *
   * @returns {CacheStorageAdapter | null} The adapter, or null before initialization
   */
  public get adapter(): CacheStorageAdapter | null {
    return this.fAdapter;
  }

  /**
   * Returns the currently configured defaults.
   *
   * @returns {CacheTypes.Defaults} A copy of the active defaults
   */
  public get defaults(): CacheTypes.Defaults {
    return { ...this.fDefaults };
  }

  /**
   * Sets the application wide cache defaults. Values passed per cached function
   * always win over these. Calling it repeatedly merges into the existing defaults.
   *
   * @param {CacheTypes.Defaults} defaults - Defaults to apply to every cached function
   * @returns {void}
   */
  public configure(defaults: CacheTypes.Defaults): void {
    this.fDefaults = { ...this.fDefaults, ...this.stripUndefined(defaults) };
  }

  /**
   * Wraps a function with caching.
   *
   * The returned function keeps the original signature and adds `resolveKeys()`,
   * `invalidate()` and `expire()` helpers keyed exactly like the cached calls, so
   * no cache key ever has to be rebuilt by hand.
   *
   * @template T - Return type of the wrapped function
   * @template ArgsT - Argument tuple of the wrapped function
   * @param {(...args: ArgsT) => T | Promise<T>} fn - The function to cache
   * @param {CacheTypes.Options<T, ArgsT>} [options] - Per-function cache options
   * @returns {CacheTypes.CachedFunction<T, ArgsT>} The cached function
   */
  public cached<T, ArgsT extends unknown[] = any[]>(
    fn: (...args: ArgsT) => T | Promise<T>,
    options: CacheTypes.Options<T, ArgsT> = {},
  ): CacheTypes.CachedFunction<T, ArgsT> {
    if (typeof fn !== 'function') {
      throw new CacheError('Cached target must be a function', 'cached', undefined, { received: typeof fn });
    }

    return defineCachedFunction<T, ArgsT>(fn, this.resolveOptions(options)) as CacheTypes.CachedFunction<T, ArgsT>;
  }

  /**
   * Removes cached entries for the given arguments from every storage tier.
   *
   * Pass the same options (`name`, `group`, `storage`, `getKey`) the entry was
   * cached with so the very same keys are resolved.
   *
   * @template ArgsT - Argument tuple the entry was cached under
   * @param {CacheTypes.Options<any, ArgsT>} options - Options identifying the cached function
   * @param {ArgsT} args - Arguments identifying the entry
   * @returns {Promise<void>} Resolves once every tier has been cleared
   */
  public async invalidate<ArgsT extends unknown[] = any[]>(
    options: CacheTypes.Options<any, ArgsT>,
    ...args: ArgsT
  ): Promise<void> {
    await invalidateCache<ArgsT>({ options: this.resolveOptions(options), args });
  }

  /**
   * Marks cached entries as stale without removing them.
   *
   * With `swr` enabled the stale value keeps being served (within `staleMaxAge`)
   * while the next access refreshes it in the background; without it, the next
   * call re-resolves before returning.
   *
   * @template ArgsT - Argument tuple the entry was cached under
   * @param {CacheTypes.Options<any, ArgsT>} options - Options identifying the cached function
   * @param {ArgsT} args - Arguments identifying the entry
   * @returns {Promise<void>} Resolves once every tier has been marked
   */
  public async expire<ArgsT extends unknown[] = any[]>(options: CacheTypes.Options<any, ArgsT>, ...args: ArgsT): Promise<void> {
    await expireCache<ArgsT>({ options: this.resolveOptions(options), args });
  }

  /**
   * Resolves every storage key (one per storage tier) the given arguments cache under.
   * Useful for debugging and for cache inspection tooling.
   *
   * @template ArgsT - Argument tuple the entry was cached under
   * @param {CacheTypes.Options<any, ArgsT>} options - Options identifying the cached function
   * @param {ArgsT} args - Arguments identifying the entry
   * @returns {Promise<string[]>} The resolved storage keys
   */
  public async resolveKeys<ArgsT extends unknown[] = any[]>(
    options: CacheTypes.Options<any, ArgsT>,
    ...args: ArgsT
  ): Promise<string[]> {
    return resolveCacheKeys<ArgsT>({ options: this.resolveOptions(options), args });
  }

  /**
   * Merges the configured defaults into per-function options and translates the
   * Vercube `storage` option into the key base the storage adapter routes on.
   *
   * @template T - Return type of the cached function
   * @template ArgsT - Argument tuple of the cached function
   * @param {CacheTypes.Options<T, ArgsT>} options - Per-function cache options
   * @returns {CacheOptions<T, ArgsT>} Options understood by the caching engine
   * @protected
   */
  protected resolveOptions<T, ArgsT extends unknown[]>(options: CacheTypes.Options<T, ArgsT>): CacheOptions<T, ArgsT> {
    const { storage, ...rest } = {
      ...this.fDefaults,
      ...this.stripUndefined(options),
    } as CacheTypes.Options<T, ArgsT>;

    const storages = Array.isArray(storage) ? storage : [storage];

    if (storages.length === 0) {
      // an empty tier list would make every read miss and every write a no-op,
      // silently disabling the cache instead of failing where the mistake is
      throw new CacheError('At least one storage must be given when caching', 'resolveOptions', undefined, {
        name: rest.name,
      });
    }

    const base = storages.map((name) => cacheBaseForStorage(name));

    return {
      ...rest,
      base: base.length === 1 ? base[0] : base,
    } as CacheOptions<T, ArgsT>;
  }

  /**
   * Drops keys whose value is `undefined`, so that an explicitly passed
   * `undefined` never shadows a configured default with a missing value.
   *
   * @template T - Shape of the option object
   * @param {T} options - Options to clean up
   * @returns {Partial<T>} The options without undefined values
   * @protected
   */
  protected stripUndefined<T extends object>(options: T): Partial<T> {
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<T>;
  }

  /**
   * Installs the storage adapter into the caching engine.
   * Called automatically with the `@Init()` decorator.
   *
   * @returns {void}
   * @protected
   */
  @Init()
  protected init(): void {
    if (!this.gContainer.getOptional(StorageManager)) {
      this.gLogger?.warn(
        'Vercube/CacheManager::StorageManager is not registered - bind it so cached entries have a storage to live in',
      );
    }

    // the caching engine keeps a single process-wide storage, so a second
    // CacheManager takes over every cached function in the process
    if (useStorage() instanceof CacheStorageAdapter) {
      this.gLogger?.warn(
        'Vercube/CacheManager::another CacheManager is already installed in this process - ' +
          'cached functions from every container will now route through this one',
      );
    }

    this.fAdapter = this.gContainer.resolve(CacheStorageAdapter);
    setStorage(this.fAdapter);
  }
}
