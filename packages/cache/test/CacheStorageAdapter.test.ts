import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Storage, StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheBaseForStorage, CacheError, CacheStorageAdapter, storageNameFromCacheKey } from '../src';

describe('CacheStorageAdapter', () => {
  let container: Container;
  let logger: Logger;
  let storageManager: StorageManager;

  beforeEach(async () => {
    container = new Container();
    logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bind(StorageManager);
    container.bind(Storage);
    container.bind(MemoryStorage);
    initializeContainer(container);

    storageManager = container.get(StorageManager);
    await storageManager.mount({ storage: MemoryStorage });
    await storageManager.mount({ name: 'secondary', storage: MemoryStorage });
  });

  describe('cacheBaseForStorage', () => {
    it('should use the bare prefix for the default storage', () => {
      expect(cacheBaseForStorage()).toBe('/cache');
      expect(cacheBaseForStorage('default')).toBe('/cache');
    });

    it('should append the storage name for named storages', () => {
      expect(cacheBaseForStorage('redis')).toBe('/cache/redis');
    });

    it('should reject a storage name that would break key routing', () => {
      // the base is read back by splitting on the first colon
      expect(() => cacheBaseForStorage('a:b')).toThrow(CacheError);
    });
  });

  describe('storageNameFromCacheKey', () => {
    it('should resolve the default storage from a bare key', () => {
      expect(storageNameFromCacheKey('/cache:functions:getUser:abc.json')).toBe('default');
    });

    it('should resolve a named storage', () => {
      expect(storageNameFromCacheKey('/cache/redis:functions:getUser:abc.json')).toBe('redis');
    });

    it('should handle keys without a separator', () => {
      expect(storageNameFromCacheKey('/cache/redis')).toBe('redis');
      expect(storageNameFromCacheKey('/cache')).toBe('default');
    });

    it('should fall back to the default storage for an empty name segment', () => {
      expect(storageNameFromCacheKey('/cache/:functions:getUser:abc.json')).toBe('default');
    });
  });

  describe('routing', () => {
    it('should route entries to the storage encoded in the key', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache:functions:a:1.json', { value: 'default-storage' });
      await adapter.set('/cache/secondary:functions:a:1.json', { value: 'secondary-storage' });

      await expect(storageManager.getItem({ key: '/cache:functions:a:1.json' })).resolves.toEqual({ value: 'default-storage' });
      await expect(storageManager.getItem({ storage: 'secondary', key: '/cache/secondary:functions:a:1.json' })).resolves.toEqual(
        { value: 'secondary-storage' },
      );
    });

    it('should read entries back from the storage encoded in the key', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache/secondary:functions:a:1.json', { value: 42 });

      await expect(adapter.get('/cache/secondary:functions:a:1.json')).resolves.toEqual({ value: 42 });
      await expect(adapter.get('/cache:functions:a:1.json')).resolves.toBeNull();
    });

    it('should return null for missing entries', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      await expect(adapter.get('/cache:functions:missing:1.json')).resolves.toBeNull();
    });

    it('should delete the entry when null is written', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache:functions:a:1.json', { value: 1 });
      await adapter.set('/cache:functions:a:1.json', null);

      await expect(storageManager.hasItem({ key: '/cache:functions:a:1.json' })).resolves.toBe(false);
      await expect(adapter.get('/cache:functions:a:1.json')).resolves.toBeNull();
    });

    it('should forward the ttl hint to the storage', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      const storage = storageManager.getStorage()!;
      const spy = vi.spyOn(storage, 'setItem');

      await adapter.set('/cache:functions:a:1.json', { value: 1 }, { ttl: 60 });

      expect(spy).toHaveBeenCalledWith('/cache:functions:a:1.json', { value: 1 }, { ttl: 60 });
    });
  });

  describe('auto-mount', () => {
    it('should mount an in-memory storage when the requested one is missing', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache/nope:functions:a:1.json', { value: 'auto-mounted' });

      // the entry lives in a regular storage, reachable through the StorageManager
      expect(storageManager.getStorage('nope')).toBeInstanceOf(MemoryStorage);
      await expect(storageManager.getItem({ storage: 'nope', key: '/cache/nope:functions:a:1.json' })).resolves.toEqual({
        value: 'auto-mounted',
      });
      expect(logger.warn).toHaveBeenCalledOnce();
    });

    it('should mount a missing storage only once', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache/nope:functions:a:1.json', { value: 1 });
      await adapter.set('/cache/nope:functions:a:2.json', { value: 2 });

      await expect(storageManager.size({ storage: 'nope' })).resolves.toBe(2);
      expect(logger.warn).toHaveBeenCalledOnce();
    });

    it('should share one storage between concurrent auto-mounts', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await Promise.all([
        adapter.set('/cache/nope:functions:a:1.json', { value: 1 }),
        adapter.set('/cache/nope:functions:a:2.json', { value: 2 }),
        adapter.set('/cache/nope:functions:a:3.json', { value: 3 }),
      ]);

      await expect(storageManager.size({ storage: 'nope' })).resolves.toBe(3);
    });

    it('should not touch storages that are already mounted', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      const mounted = storageManager.getStorage('secondary');

      await adapter.set('/cache/secondary:functions:a:1.json', { value: 1 });

      expect(storageManager.getStorage('secondary')).toBe(mounted);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should share a single in-flight mount between concurrent callers', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      const realMount = storageManager.mount.bind(storageManager);

      // a slow mount lets later callers reach the in-flight branch
      const mount = vi.spyOn(storageManager, 'mount').mockImplementation(async (params) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return realMount(params);
      });

      await Promise.all([
        adapter.set('/cache/slow:functions:a:1.json', { value: 1 }),
        adapter.set('/cache/slow:functions:a:2.json', { value: 2 }),
        adapter.set('/cache/slow:functions:a:3.json', { value: 3 }),
      ]);

      expect(mount).toHaveBeenCalledOnce();
      await expect(storageManager.size({ storage: 'slow' })).resolves.toBe(3);
    });

    it('should fail loudly when the fallback storage cannot be mounted', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      vi.spyOn(storageManager, 'mount').mockResolvedValue(undefined);

      await expect(adapter.get('/cache/nope:functions:a:1.json')).rejects.toThrow(CacheError);
    });

    it('should stay retryable after a failed mount', async () => {
      const adapter = container.resolve(CacheStorageAdapter);
      const realMount = storageManager.mount.bind(storageManager);

      const mount = vi.spyOn(storageManager, 'mount').mockRejectedValueOnce(new Error('transient failure'));

      await expect(adapter.get('/cache/flaky:functions:a:1.json')).rejects.toThrow('transient failure');

      // a failed mount must not poison the name for the rest of the process
      mount.mockImplementation(realMount);

      await adapter.set('/cache/flaky:functions:a:1.json', { value: 'recovered' });
      await expect(adapter.get('/cache/flaky:functions:a:1.json')).resolves.toEqual({ value: 'recovered' });
    });

    it('should let a real storage mounted later take over from the fallback', async () => {
      const adapter = container.resolve(CacheStorageAdapter);

      await adapter.set('/cache/late:functions:a:1.json', { value: 'from-fallback' });

      // replace the auto-mounted storage with a deliberately mounted one
      await storageManager.mount({ name: 'late', storage: MemoryStorage });

      await expect(adapter.get('/cache/late:functions:a:1.json')).resolves.toBeNull();

      await adapter.set('/cache/late:functions:a:1.json', { value: 'from-real-storage' });
      await expect(storageManager.getItem({ storage: 'late', key: '/cache/late:functions:a:1.json' })).resolves.toEqual({
        value: 'from-real-storage',
      });
    });

    it('should fail loudly when no StorageManager is registered', async () => {
      const bare = new Container();
      bare.bindInstance(Container, bare);
      initializeContainer(bare);

      const adapter = bare.resolve(CacheStorageAdapter);

      await expect(adapter.get('/cache:functions:a:1.json')).rejects.toThrow(CacheError);
    });
  });
});
