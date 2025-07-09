import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager, Storage } from '../src';
import { MemoryStorage } from '../src/Storages/MemoryStorage';
import { S3Storage } from '../src/Storages/S3Storage';
import { initializeContainer } from '@vercube/di';
import { TestStorage, ErrorStorage } from './Utils/Mock.mock';

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
        await expect(storageManager.deleteItem({
          key: 'nonExistent',
        })).resolves.not.toThrow();
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

      it('should return false when storage is undefined', async () => {
        const result = await storageManager.hasItem({
          storage: 'nonExistentStorage',
          key: 'testKey',
        });
        expect(result).toBe(false);
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

      it('should return empty array when storage is undefined', async () => {
        const result = await storageManager.getKeys({
          storage: 'nonExistentStorage',
        });
        expect(result).toEqual([]);
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

      it('should not throw when storage is undefined', async () => {
        await expect(storageManager.clear({
          storage: 'nonExistentStorage',
        })).resolves.not.toThrow();
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

      it('should return 0 when storage is undefined', async () => {
        const result = await storageManager.size({
          storage: 'nonExistentStorage',
        });
        expect(result).toBe(0);
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
}); 