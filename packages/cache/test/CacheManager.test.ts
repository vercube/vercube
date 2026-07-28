import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Storage, StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheError, CacheManager } from '../src';
import { BrokenStorage } from './Utils/Mock.mock';
import type { CacheTypes } from '../src';

describe('CacheManager', () => {
  let container: Container;
  let storageManager: StorageManager;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    container = new Container();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger);
    container.bind(StorageManager);
    container.bind(Storage);
    container.bind(MemoryStorage);
    container.bind(CacheManager);
    initializeContainer(container);

    storageManager = container.get(StorageManager);
    await storageManager.mount({ storage: MemoryStorage });
    await storageManager.mount({ name: 'secondary', storage: MemoryStorage });

    cacheManager = container.get(CacheManager);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should install the storage adapter on init', () => {
      expect(cacheManager.adapter).not.toBeNull();
    });

    it('should warn when no StorageManager is bound', () => {
      const bare = new Container();
      const bareLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;

      bare.bindInstance(Container, bare);
      bare.bindInstance(Logger, bareLogger);
      bare.bind(CacheManager);
      initializeContainer(bare);

      expect(bareLogger.warn).toHaveBeenCalledWith(expect.stringContaining('StorageManager is not registered'));
    });
  });

  describe('resilience', () => {
    it('should still resolve the value when the storage cannot be read or written', async () => {
      await storageManager.mount({ name: 'broken', storage: BrokenStorage });

      const onError = vi.fn();
      const resolver = vi.fn(async () => 'value');
      const cached = cacheManager.cached(resolver, { name: 'broken', maxAge: 60, storage: 'broken', onError });

      // a cache that cannot store anything degrades into calling through every time
      await expect(cached()).resolves.toBe('value');
      await expect(cached()).resolves.toBe('value');

      expect(resolver).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls.every(([error]) => error instanceof Error)).toBe(true);
    });

    it('should propagate failures from an explicit invalidate or expire', async () => {
      await storageManager.mount({ name: 'broken', storage: BrokenStorage });

      const options = { name: 'broken-invalidate', maxAge: 60, storage: 'broken' };

      // unlike a cached call, an explicitly requested write is not swallowed
      await expect(cacheManager.invalidate(options)).rejects.toThrow('storage delete failed');
      await expect(cacheManager.expire(options)).rejects.toThrow('storage read failed');
    });

    it('should report read and write failures separately', async () => {
      await storageManager.mount({ name: 'broken', storage: BrokenStorage });

      const onError = vi.fn();
      const cached = cacheManager.cached(async () => 'value', {
        name: 'broken-split',
        maxAge: 60,
        storage: 'broken',
        onError,
      });

      await cached();

      const messages = onError.mock.calls.map(([error]) => (error as Error).message);
      expect(messages).toContain('storage read failed');
      expect(messages).toContain('storage write failed');
    });
  });

  describe('option pass-through', () => {
    it('should honour shouldBypassCache', async () => {
      const resolver = vi.fn(async (id: string) => `user-${id}`);
      const cached = cacheManager.cached(resolver, {
        name: 'bypass',
        maxAge: 60,
        shouldBypassCache: (id) => id === 'fresh',
      });

      await cached('fresh');
      await cached('fresh');
      await cached('cached');
      await cached('cached');

      expect(resolver).toHaveBeenCalledTimes(3);
    });

    it('should honour shouldInvalidateCache', async () => {
      let invalidate = false;
      const resolver = vi.fn(async () => 'value');
      const cached = cacheManager.cached(resolver, {
        name: 'invalidate-hook',
        maxAge: 60,
        shouldInvalidateCache: () => invalidate,
      });

      await cached();
      await cached();
      expect(resolver).toHaveBeenCalledOnce();

      invalidate = true;
      await cached();
      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should honour validate', async () => {
      const resolver = vi.fn(async () => 'value');
      const cached = cacheManager.cached(resolver, {
        name: 'validate',
        maxAge: 60,
        validate: () => false,
      });

      await cached();
      await cached();

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should expose the serve status to transform', async () => {
      const seen: (CacheTypes.Status | undefined)[] = [];
      const cached = cacheManager.cached(async () => 'value', {
        name: 'status',
        maxAge: 60,
        transform: (entry) => {
          seen.push(entry.status);
          return entry.value;
        },
      });

      await cached();
      await cached();

      expect(seen).toEqual(['miss', 'hit']);
    });

    it('should derive the lifetime through getMaxAge', async () => {
      vi.useFakeTimers();

      const resolver = vi.fn(async () => ({ expiresIn: 10 }));
      const cached = cacheManager.cached(resolver, {
        name: 'get-max-age',
        maxAge: 3600,
        getMaxAge: (entry) => entry.value?.expiresIn,
      });

      await cached();
      vi.advanceTimersByTime(11_000);
      await cached();

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should separate entries by group', async () => {
      const options = { name: 'grouped', maxAge: 60 };

      await cacheManager.cached(async () => 'a', { ...options, group: 'one' })();
      await cacheManager.cached(async () => 'b', { ...options, group: 'two' })();

      const keys = await storageManager.getKeys({});
      expect(keys.some((key) => key.startsWith('/cache:one:grouped:'))).toBe(true);
      expect(keys.some((key) => key.startsWith('/cache:two:grouped:'))).toBe(true);
    });
  });

  describe('cached', () => {
    it('should resolve the value only once for the same arguments', async () => {
      const resolver = vi.fn(async (id: string) => `user-${id}`);
      const cached = cacheManager.cached(resolver, { name: 'getUser', maxAge: 60 });

      await expect(cached('1')).resolves.toBe('user-1');
      await expect(cached('1')).resolves.toBe('user-1');

      expect(resolver).toHaveBeenCalledOnce();
    });

    it('should keep a separate entry per argument set', async () => {
      const resolver = vi.fn(async (id: string) => `user-${id}`);
      const cached = cacheManager.cached(resolver, { name: 'getUser', maxAge: 60 });

      await expect(cached('1')).resolves.toBe('user-1');
      await expect(cached('2')).resolves.toBe('user-2');

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should coalesce concurrent calls into a single resolution', async () => {
      const resolver = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'value';
      });
      const cached = cacheManager.cached(resolver, { name: 'concurrent', maxAge: 60 });

      await Promise.all([cached(), cached(), cached()]);

      expect(resolver).toHaveBeenCalledOnce();
    });

    it('should re-resolve once the entry is no longer fresh', async () => {
      vi.useFakeTimers();

      const resolver = vi.fn(async () => Date.now());
      const cached = cacheManager.cached(resolver, { name: 'ttl', maxAge: 10 });

      await cached();
      vi.advanceTimersByTime(5000);
      await cached();
      expect(resolver).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(6000);
      await cached();
      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should honour a custom key derivation', async () => {
      const resolver = vi.fn(async (input: { id: string; trace: string }) => input.id);
      const cached = cacheManager.cached(resolver, {
        name: 'custom-key',
        maxAge: 60,
        getKey: (input) => input.id,
      });

      await cached({ id: '1', trace: 'a' });
      await cached({ id: '1', trace: 'b' });

      expect(resolver).toHaveBeenCalledOnce();
    });

    it('should reject non-function targets', () => {
      expect(() => cacheManager.cached('nope' as unknown as () => void)).toThrow(CacheError);
    });
  });

  describe('storage routing', () => {
    it('should store entries in the default storage', async () => {
      const cached = cacheManager.cached(async () => 'value', { name: 'default-storage', maxAge: 60 });
      await cached();

      const keys = await storageManager.getKeys({});
      expect(keys.some((key) => key.startsWith('/cache:functions:default-storage:'))).toBe(true);
      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(0);
    });

    it('should store entries in the requested storage', async () => {
      const cached = cacheManager.cached(async () => 'value', {
        name: 'named-storage',
        maxAge: 60,
        storage: 'secondary',
      });
      await cached();

      await expect(storageManager.size({})).resolves.toBe(0);
      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(1);
    });

    it('should write to every tier when several storages are given', async () => {
      const cached = cacheManager.cached(async () => 'value', {
        name: 'tiered',
        maxAge: 60,
        storage: ['default', 'secondary'],
      });
      await cached();

      await expect(storageManager.size({})).resolves.toBe(1);
      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(1);
    });

    it('should fall through to the slower tier when the faster one misses', async () => {
      const resolver = vi.fn(async () => 'value');
      const options = { name: 'tiered-read', maxAge: 60, storage: ['default', 'secondary'] };

      // seed both tiers, then drop the fast one only
      await cacheManager.cached(resolver, options)();
      const [fastKey] = await cacheManager.resolveKeys({ ...options, storage: 'default' });
      await storageManager.deleteItem({ key: fastKey });
      await expect(storageManager.size({})).resolves.toBe(0);

      await expect(cacheManager.cached(resolver, options)()).resolves.toBe('value');

      expect(resolver).toHaveBeenCalledOnce();
    });
  });

  describe('defaults', () => {
    it('should apply configured defaults', async () => {
      cacheManager.configure({ maxAge: 60, storage: 'secondary' });

      const cached = cacheManager.cached(async () => 'value', { name: 'with-defaults' });
      await cached();

      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(1);
      expect(cacheManager.defaults).toEqual({ maxAge: 60, storage: 'secondary' });
    });

    it('should let per-function options win over defaults', async () => {
      cacheManager.configure({ storage: 'secondary' });

      const cached = cacheManager.cached(async () => 'value', { name: 'override', maxAge: 60, storage: 'default' });
      await cached();

      await expect(storageManager.size({})).resolves.toBe(1);
      await expect(storageManager.size({ storage: 'secondary' })).resolves.toBe(0);
    });

    it('should merge repeated configure calls', () => {
      cacheManager.configure({ maxAge: 30 });
      cacheManager.configure({ swr: true });

      expect(cacheManager.defaults).toEqual({ maxAge: 30, swr: true });
    });

    it('should ignore explicitly undefined defaults', async () => {
      vi.useFakeTimers();

      cacheManager.configure({ maxAge: 10 });
      cacheManager.configure({ maxAge: undefined });

      expect(cacheManager.defaults).toEqual({ maxAge: 10 });

      // an undefined default must not wipe the freshness window
      const resolver = vi.fn(async () => 'value');
      const cached = cacheManager.cached(resolver, { name: 'undefined-default' });

      await cached();
      vi.advanceTimersByTime(11_000);
      await cached();

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should reject an empty list of storages', () => {
      expect(() => cacheManager.cached(async () => 'value', { name: 'no-storage', storage: [] })).toThrow(CacheError);
    });
  });

  describe('resolveKeys', () => {
    it('should resolve one key per storage tier', async () => {
      const keys = await cacheManager.resolveKeys({ name: 'keys', storage: ['default', 'secondary'] }, '1');

      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^\/cache:functions:keys:/);
      expect(keys[1]).toMatch(/^\/cache\/secondary:functions:keys:/);
    });

    it('should match the key a cached call actually writes', async () => {
      const options = { name: 'key-match', maxAge: 60 };
      await cacheManager.cached(async (id: string) => id, options)('1');

      const [key] = await cacheManager.resolveKeys(options, '1');
      await expect(storageManager.hasItem({ key })).resolves.toBe(true);
    });
  });

  describe('invalidate', () => {
    it('should drop the entry so the next call resolves again', async () => {
      const resolver = vi.fn(async (id: string) => `user-${id}`);
      const options = { name: 'invalidate', maxAge: 60 };
      const cached = cacheManager.cached(resolver, options);

      await cached('1');
      await cacheManager.invalidate(options, '1');
      await cached('1');

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should leave other entries untouched', async () => {
      const resolver = vi.fn(async (id: string) => `user-${id}`);
      const options = { name: 'invalidate-scoped', maxAge: 60 };
      const cached = cacheManager.cached(resolver, options);

      await cached('1');
      await cached('2');
      await cacheManager.invalidate(options, '1');
      await cached('2');

      expect(resolver).toHaveBeenCalledTimes(2);
    });
  });

  describe('expire', () => {
    it('should mark the entry stale so the next call resolves again', async () => {
      const resolver = vi.fn(async () => 'value');
      const options = { name: 'expire', maxAge: 60 };
      const cached = cacheManager.cached(resolver, options);

      await cached();
      await cacheManager.expire(options);
      await cached();

      expect(resolver).toHaveBeenCalledTimes(2);
    });

    it('should serve the stale value while refreshing in the background with swr', async () => {
      let counter = 0;
      const resolver = vi.fn(async () => {
        const next = ++counter;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return next;
      });
      const options = { name: 'expire-swr', maxAge: 60, swr: true, staleMaxAge: 600 };
      const cached = cacheManager.cached(resolver, options);

      await expect(cached()).resolves.toBe(1);
      await cacheManager.expire(options);

      // the stale value comes back without waiting for the refresh to finish
      await expect(cached()).resolves.toBe(1);
      expect(resolver).toHaveBeenCalledTimes(2);

      // once the background refresh settles, the fresh value is served
      await vi.waitFor(() => expect(cached()).resolves.toBe(2));
      expect(resolver).toHaveBeenCalledTimes(2);
    });
  });
});
