import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Storage, StorageError, StorageManager } from '../src';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';
import { S3Storage } from '../src/Drivers/S3Storage';
import { ErrorStorage, TestStorage } from './Utils/Mock.mock';

describe('StorageManager', () => {
  let container: Container;
  let logger: Logger;
  let storageManager: StorageManager;

  beforeEach(() => {
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
    container.bind(MemoryStorage);
    container.bind(Storage);
    initializeContainer(container);

    storageManager = container.resolve(StorageManager);
  });

  describe('mount', () => {
    it('should mount a storage with default name', async () => {
      await storageManager.mount({
        storage: MemoryStorage,
        initOptions: { test: true },
      });

      const storage = storageManager.getStorage();
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(MemoryStorage);
    });

    it('should mount a storage with custom name', async () => {
      const customName = 'customStorage';
      await storageManager.mount({
        name: customName,
        storage: MemoryStorage,
        initOptions: { test: true },
      });

      const storage = storageManager.getStorage(customName);
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(MemoryStorage);
    });

    it('should handle multiple storages', async () => {
      await storageManager.mount({
        name: 'storage1',
        storage: MemoryStorage,
      });

      await storageManager.mount({
        name: 'storage2',
        storage: MemoryStorage,
      });

      await storageManager.mount({
        name: 'storage3',
        storage: S3Storage,
        initOptions: {
          region: 'us-east-1',
          bucket: 'test-bucket',
        },
      });

      const storage1 = storageManager.getStorage('storage1');
      const storage2 = storageManager.getStorage('storage2');
      const storage3 = storageManager.getStorage('storage3');

      expect(storage1).toBeDefined();
      expect(storage2).toBeDefined();
      expect(storage3).toBeDefined();
      expect(storage1).not.toBe(storage2);
      expect(storage2).not.toBe(storage3);
    });
  });

  describe('getStorage', () => {
    it('should return undefined for non-existent storage', () => {
      const storage = storageManager.getStorage('nonExistent');
      expect(storage).toBeUndefined();
    });

    it('should return default storage when no name is provided', async () => {
      await storageManager.mount({
        storage: MemoryStorage,
      });

      const storage = storageManager.getStorage();
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(MemoryStorage);
    });
  });

  describe('storage operations', () => {
    beforeEach(async () => {
      await storageManager.mount({
        storage: MemoryStorage,
      });
    });

    describe('getItem', () => {
      it('should return null for non-existent item', async () => {
        const result = await storageManager.getItem({
          key: 'nonExistent',
        });
        expect(result).toBeNull();
      });

      it('should return stored item', async () => {
        const testValue = { test: 'value' };
        await storageManager.setItem({
          key: 'testKey',
          value: testValue,
        });

        const result = await storageManager.getItem({
          key: 'testKey',
        });
        expect(result).toEqual(testValue);
      });
    });

    describe('getItems', () => {
      it('should return empty array for non-existent items', async () => {
        const result = await storageManager.getItems({
          keys: ['nonExistent1', 'nonExistent2'],
        });
        expect(result).toEqual([undefined, undefined]);
      });

      it('should return stored items', async () => {
        const testValue1 = { test: 'value1' };
        const testValue2 = { test: 'value2' };
        await storageManager.setItem({
          key: 'testKey1',
          value: testValue1,
        });
        await storageManager.setItem({
          key: 'testKey2',
          value: testValue2,
        });

        const result = await storageManager.getItems({
          keys: ['testKey1', 'testKey2'],
        });
        expect(result).toEqual([testValue1, testValue2]);
      });

      it('should return items with correct types', async () => {
        await storageManager.setItem({
          key: 'stringKey',
          value: 'stringValue',
        });
        await storageManager.setItem({
          key: 'numberKey',
          value: 42,
        });
        await storageManager.setItem({
          key: 'objectKey',
          value: { key: 'value' },
        });

        const result = await storageManager.getItems({
          keys: ['stringKey', 'numberKey', 'objectKey'],
        });
        expect(result[0]).toBe('stringValue');
        expect(result[1]).toBe(42);
        expect(result[2]).toEqual({ key: 'value' });
      });

      it('should throw for a storage that is not mounted', async () => {
        await expect(storageManager.getItems({ storage: 'nonExistentStorage', keys: ['testKey1'] })).rejects.toThrow(
          'Storage "nonExistentStorage" is not mounted',
        );
      });

      it('should return items from custom storage', async () => {
        await storageManager.mount({
          name: 'custom',
          storage: MemoryStorage,
        });

        const testValue1 = { test: 'value1' };
        const testValue2 = { test: 'value2' };
        await storageManager.setItem({
          storage: 'custom',
          key: 'testKey1',
          value: testValue1,
        });
        await storageManager.setItem({
          storage: 'custom',
          key: 'testKey2',
          value: testValue2,
        });

        const result = await storageManager.getItems({
          storage: 'custom',
          keys: ['testKey1', 'testKey2'],
        });
        expect(result).toEqual([testValue1, testValue2]);
      });

      it('should handle mixed existing and non-existing keys', async () => {
        await storageManager.setItem({
          key: 'existingKey',
          value: 'existingValue',
        });

        const result = await storageManager.getItems({
          keys: ['existingKey', 'nonExistentKey'],
        });
        expect(result).toEqual(['existingValue', undefined]);
      });

      it('should return empty array for empty keys array', async () => {
        const result = await storageManager.getItems({
          keys: [],
        });
        expect(result).toEqual([]);
      });
    });

    describe('setItem', () => {
      it('should store item with default storage', async () => {
        const testValue = { test: 'value' };
        await storageManager.setItem({
          key: 'testKey',
          value: testValue,
        });

        const result = await storageManager.getItem({
          key: 'testKey',
        });
        expect(result).toEqual(testValue);
      });

      it('should store item with custom storage', async () => {
        await storageManager.mount({
          name: 'custom',
          storage: MemoryStorage,
        });

        const testValue = { test: 'value' };
        await storageManager.setItem({
          storage: 'custom',
          key: 'testKey',
          value: testValue,
        });

        const result = await storageManager.getItem({
          storage: 'custom',
          key: 'testKey',
        });
        expect(result).toEqual(testValue);
      });
    });

    describe('deleteItem', () => {
      it('should delete existing item', async () => {
        await storageManager.setItem({
          key: 'testKey',
          value: 'testValue',
        });

        await storageManager.deleteItem({
          key: 'testKey',
        });

        const result = await storageManager.getItem({
          key: 'testKey',
        });
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent item', async () => {
        await expect(
          storageManager.deleteItem({
            key: 'nonExistent',
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('hasItem', () => {
      it('should return true for existing item', async () => {
        await storageManager.setItem({
          key: 'testKey',
          value: 'testValue',
        });

        const result = await storageManager.hasItem({
          key: 'testKey',
        });
        expect(result).toBe(true);
      });

      it('should return false for non-existent item', async () => {
        const result = await storageManager.hasItem({
          key: 'nonExistent',
        });
        expect(result).toBe(false);
      });

      it('should throw for a storage that is not mounted', async () => {
        await expect(storageManager.hasItem({ storage: 'nonExistentStorage', key: 'testKey' })).rejects.toBeInstanceOf(
          StorageError,
        );
      });
    });

    describe('getKeys', () => {
      it('should return empty array for empty storage', async () => {
        const result = await storageManager.getKeys({});
        expect(result).toEqual([]);
      });

      it('should return all keys', async () => {
        await storageManager.setItem({
          key: 'key1',
          value: 'value1',
        });

        await storageManager.setItem({
          key: 'key2',
          value: 'value2',
        });

        const result = await storageManager.getKeys({});
        expect(result).toContain('key1');
        expect(result).toContain('key2');
        expect(result.length).toBe(2);
      });

      it('should throw for a storage that is not mounted', async () => {
        await expect(storageManager.getKeys({ storage: 'nonExistentStorage' })).rejects.toBeInstanceOf(StorageError);
      });
    });

    describe('clear', () => {
      it('should clear all items', async () => {
        await storageManager.setItem({
          key: 'key1',
          value: 'value1',
        });

        await storageManager.setItem({
          key: 'key2',
          value: 'value2',
        });

        await storageManager.clear({});

        const keys = await storageManager.getKeys({});
        expect(keys).toEqual([]);
      });

      it('should not throw when clearing empty storage', async () => {
        await expect(storageManager.clear({})).resolves.not.toThrow();
      });

      it('should throw for a storage that is not mounted', async () => {
        await expect(storageManager.clear({ storage: 'nonExistentStorage' })).rejects.toBeInstanceOf(StorageError);
      });
    });

    describe('size', () => {
      it('should return 0 for empty storage', async () => {
        const result = await storageManager.size({});
        expect(result).toBe(0);
      });

      it('should return correct size', async () => {
        await storageManager.setItem({
          key: 'key1',
          value: 'value1',
        });

        await storageManager.setItem({
          key: 'key2',
          value: 'value2',
        });

        const result = await storageManager.size({});
        expect(result).toBe(2);
      });

      it('should throw for a storage that is not mounted', async () => {
        await expect(storageManager.size({ storage: 'nonExistentStorage' })).rejects.toBeInstanceOf(StorageError);
      });
    });
  });

  describe('initialization', () => {
    it('should initialize all mounted storages', async () => {
      const container = new Container();

      // Get the StorageManager instance
      container.bind(StorageManager);
      const manager = container.get(StorageManager);

      // Mount storages before initialization
      await manager.mount({
        name: 'storage1',
        storage: TestStorage,
      });

      const storage1 = manager.getStorage('storage1')!;

      initializeContainer(container);

      expect(storage1.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const container = new Container();

      // Get the StorageManager instance
      container.bind(StorageManager);
      container.bindInstance(Logger, logger);
      const manager = container.get(StorageManager);

      // Mount storage before initialization
      await manager.mount({
        name: 'errorStorage',
        storage: ErrorStorage,
      });

      // Initialize the container to trigger @Init decorators
      initializeContainer(container);

      // add delay to ensure logger is called
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('mount lifecycle', () => {
    const boot = async () => {
      const container = new Container();
      container.bind(StorageManager);
      container.bindInstance(Logger, logger);
      const manager = container.get(StorageManager);
      initializeContainer(container);
      // let the @Init() run
      await new Promise((resolve) => setTimeout(resolve, 0));
      return manager;
    };

    it('should fail every operation on a storage that failed to initialize', async () => {
      const container = new Container();
      container.bind(StorageManager);
      container.bindInstance(Logger, logger);
      const manager = container.get(StorageManager);

      await manager.mount({ name: 'broken', storage: ErrorStorage });
      initializeContainer(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(manager.setItem({ storage: 'broken', key: 'k', value: 1 })).rejects.toThrow(
        'Failed to initialize storage "broken"',
      );
      await expect(manager.getItem({ storage: 'broken', key: 'k' })).rejects.toMatchObject({ operation: 'initialize' });
    });

    it('should initialize a storage mounted after startup', async () => {
      const manager = await boot();

      await manager.mount({ name: 'late', storage: TestStorage });

      expect(manager.getStorage('late')!.initialize).toHaveBeenCalled();
    });

    it('should reject mounting a storage that fails to initialize after startup', async () => {
      const manager = await boot();

      await expect(manager.mount({ name: 'late', storage: ErrorStorage })).rejects.toBeInstanceOf(StorageError);
      await expect(manager.hasItem({ storage: 'late', key: 'k' })).rejects.toBeInstanceOf(StorageError);
    });

    it('should wait for the driver to clear', async () => {
      const manager = await boot();
      await manager.mount({ name: 'slow', storage: TestStorage });
      let cleared = false;
      vi.spyOn(manager.getStorage('slow')!, 'clear').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        cleared = true;
      });

      await manager.clear({ storage: 'slow' });

      expect(cleared).toBe(true);
    });

    it('should throw for writes and reads on a storage that is not mounted', async () => {
      const manager = await boot();

      await expect(manager.setItem({ storage: 'sesions', key: 'k', value: 1 })).rejects.toThrow(
        'Storage "sesions" is not mounted',
      );
      await expect(manager.getItem({ storage: 'sesions', key: 'k' })).rejects.toBeInstanceOf(StorageError);
      await expect(manager.deleteItem({ storage: 'sesions', key: 'k' })).rejects.toBeInstanceOf(StorageError);
    });
  });
});
