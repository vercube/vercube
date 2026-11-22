import { defineErrorCatalog } from '@vercube/di';
import { CacheError } from './CacheError';

/**
 * The errors of the cache module.
 */
export const CacheErrors = defineErrorCatalog('VERCUBE_CACHE', {
  DECORATOR_NOT_ON_METHOD: {
    message: (_: { property: string; received: string }) => '@Cache() can only be applied to methods',
    why: '`@Cache()` wraps a method so its result can be stored. It was put on a property whose value is not a function. The `metadata` of the error names the property and what it holds.',
    fix: 'Move `@Cache()` to a method of the class. To cache a function that is not a method, wrap it with `CacheManager.cached(fn, options)`.',
    create: (message, params: { property: string; received: string }) =>
      new CacheError(message, 'decorate', undefined, { property: params.property, received: params.received }),
  },
  TARGET_NOT_FUNCTION: {
    message: (_: { received: string }) => 'Cached target must be a function',
    why: '`CacheManager.cached()` was called with something that is not a function, so there is nothing to call on a cache miss. Its type is in `metadata.received`.',
    fix: 'Pass the function as the first argument: `cacheManager.cached(async (id) => loadUser(id), { maxAge: 60 })`.',
    create: (message, params: { received: string }) =>
      new CacheError(message, 'cached', undefined, { received: params.received }),
  },
  STORAGE_LIST_EMPTY: {
    message: (_: { name: string | undefined }) => 'At least one storage must be given when caching',
    why: 'The `storage` option of a cached function is an empty array. With no storage every read would miss and every write would be dropped, so the cache would be off without saying so.',
    fix: "Name at least one mounted storage in the `storage` option, for example `storage: ['memory', 'redis']`, or leave `storage` out to use the `default` mount.",
    create: (message, params: { name: string | undefined }) =>
      new CacheError(message, 'resolveOptions', undefined, { name: params.name }),
  },
  STORAGE_NAME_HAS_COLON: {
    message: (_: { storage: string }) => 'Storage name used for caching must not contain a colon',
    why: 'Every cache key starts with a base that holds the storage name, and the name is read back by splitting the key on the first colon. A name with a colon in it would resolve to another storage.',
    fix: 'Rename the mount so it has no colon, in `StorageManager.mount({ name })` and in the `storage` option of `@Cache()`.',
    create: (message, params: { storage: string }) =>
      new CacheError(message, 'cacheBaseForStorage', undefined, { storage: params.storage }),
  },
  STORAGE_MANAGER_MISSING: {
    message: (_: { key: string }) =>
      'StorageManager is not registered in the container - bind it so cached entries have a storage to live in',
    why: 'Cached entries are kept in a storage of `@vercube/storage`, and the container that holds the `CacheManager` has no `StorageManager`.',
    fix: 'Bind it before the first cached call: `container.bind(StorageManager)`, with `StorageManager` imported from `@vercube/storage`.',
    create: (message, params: { key: string }) => new CacheError(message, 'resolveStorage', undefined, { key: params.key }),
  },
  FALLBACK_MOUNT_FAILED: {
    message: (_: { storage: string }) => 'Unable to mount a fallback cache storage',
    why: 'A cached function names a storage that nobody mounted, so the cache mounted a `MemoryStorage` under that name, and the `StorageManager` does not return it afterwards. That only happens with a `StorageManager` whose `mount()` or `getStorage()` was overridden.',
    fix: 'Mount the storage yourself before the first cached call: `StorageManager.mount({ name, storage: MemoryStorage })`, with the name given in `metadata.storage`.',
    create: (message, params: { storage: string }) =>
      new CacheError(message, 'mountFallback', undefined, { storage: params.storage }),
  },
});
