import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStorage = {
  getItem: vi.fn(),
  getItems: vi.fn().mockResolvedValue([{ value: 'a' }, { value: 'b' }]),
  setItem: vi.fn(),
  hasItem: vi.fn().mockResolvedValue(true),
  getKeys: vi.fn().mockResolvedValue(['key1', 'key2']),
  clear: vi.fn(),
  removeItem: vi.fn(),
  // only `mystore` is mounted in nitro.config.ts
  getMount: vi.fn((name: string) => ({ base: name === 'mystore' ? 'mystore:' : '' })),
};

vi.mock('nitro/storage', () => ({
  useStorage: vi.fn(() => mockStorage),
}));

vi.mock('@vercube/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercube/storage')>();
  return { ...actual };
});

import { useStorage } from 'nitro/storage';
import { NitroStorageManager } from '../../src/runtime/Storage';

function makeManager() {
  const manager = new NitroStorageManager();
  (manager as any).gLogger = { warn: vi.fn() };
  return manager;
}

describe('NitroStorageManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getItems.mockResolvedValue([{ value: 'a' }, { value: 'b' }]);
    mockStorage.hasItem.mockResolvedValue(true);
    mockStorage.getKeys.mockResolvedValue(['key1', 'key2']);
  });

  describe('mount()', () => {
    it('should warn that mounting is not supported', async () => {
      const manager = makeManager();
      await manager.mount({} as any);
      expect((manager as any)['gLogger'].warn).toHaveBeenCalledWith(
        'NitroStorageManager::mount',
        expect.stringContaining('not supported'),
      );
    });
  });

  describe('getStorage()', () => {
    it('should return a storage adapter for the given name', () => {
      const manager = makeManager();
      const storage = manager.getStorage('mystore');
      expect(storage).toBeDefined();
      expect(useStorage).toHaveBeenCalledWith('mystore');
    });

    it('should use the root storage without a name', () => {
      const manager = makeManager();
      manager.getStorage();
      expect(useStorage).toHaveBeenCalledWith();
      expect(useStorage).not.toHaveBeenCalledWith('');
    });

    it('should use the root storage for a name nitro.config.ts did not mount', () => {
      const manager = makeManager();
      manager.getStorage('default');
      manager.getStorage('typo');
      expect(useStorage).not.toHaveBeenCalledWith('default');
      expect(useStorage).not.toHaveBeenCalledWith('typo');
    });

    it('should warn and return 0 for size()', () => {
      const manager = makeManager();
      const storage = manager.getStorage()!;
      const result = storage.size();
      expect(result).toBe(0);
      expect((manager as any)['gLogger'].warn).toHaveBeenCalledWith(
        'NitroStorageManager::size',
        expect.stringContaining('not supported'),
      );
    });
  });

  describe('getItem()', () => {
    it('should return item from storage', async () => {
      mockStorage.getItem.mockResolvedValue('value');
      const manager = makeManager();
      const result = await manager.getItem({ key: 'mykey' });
      expect(result).toBe('value');
    });

    it('should pass storage name to useStorage', async () => {
      const manager = makeManager();
      await manager.getItem({ storage: 'mystore', key: 'k' });
      expect(useStorage).toHaveBeenCalledWith('mystore');
    });
  });

  describe('getItems()', () => {
    it('should return multiple items', async () => {
      const manager = makeManager();
      const result = await manager.getItems({ keys: ['k1', 'k2'] });
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('setItem()', () => {
    it('should set item in storage', async () => {
      const manager = makeManager();
      await manager.setItem({ key: 'mykey', value: 'myvalue' });
      expect(mockStorage.setItem).toHaveBeenCalledWith('mykey', 'myvalue', undefined);
    });
  });

  describe('deleteItem()', () => {
    it('should delete item from storage', async () => {
      const manager = makeManager();
      await manager.deleteItem({ key: 'mykey' });
      expect(mockStorage.removeItem).toHaveBeenCalledWith('mykey');
    });
  });

  describe('hasItem()', () => {
    it('should check if item exists', async () => {
      const manager = makeManager();
      const result = await manager.hasItem({ key: 'mykey' });
      expect(result).toBe(true);
    });
  });

  describe('getKeys()', () => {
    it('should return all keys', async () => {
      const manager = makeManager();
      const result = await manager.getKeys({});
      expect(result).toEqual(['key1', 'key2']);
    });
  });

  describe('clear()', () => {
    it('should clear storage', async () => {
      const manager = makeManager();
      await manager.clear({});
      expect(mockStorage.clear).toHaveBeenCalled();
    });
  });

  describe('size()', () => {
    it('should return 0', async () => {
      const manager = makeManager();
      const result = await manager.size({});
      expect(result).toBe(0);
    });
  });

  describe('when gLogger is not set', () => {
    it('mount should not throw when gLogger is null', async () => {
      const manager = new NitroStorageManager();
      await expect(manager.mount({} as any)).resolves.toBeUndefined();
    });

    it('size() inside getStorage should not throw when gLogger is null', () => {
      const manager = new NitroStorageManager();
      const storage = manager.getStorage()!;
      expect(() => storage.size()).not.toThrow();
      expect(storage.size()).toBe(0);
    });
  });

  describe('useStorage fallback', () => {
    it('should wait for writes, deletes and clears to finish', async () => {
      const done: string[] = [];
      const slow = (name: string) => async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        done.push(name);
      };
      mockStorage.setItem.mockImplementationOnce(slow('set'));
      mockStorage.removeItem.mockImplementationOnce(slow('delete'));
      mockStorage.clear.mockImplementationOnce(slow('clear'));
      const manager = makeManager();

      await manager.setItem({ key: 'k', value: 1 });
      await manager.deleteItem({ key: 'k' });
      await manager.clear({});

      expect(done).toEqual(['set', 'delete', 'clear']);
    });
  });

  describe('when storage instance is undefined', () => {
    it('getItem should return null', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      const result = await manager.getItem({ key: 'key' });
      expect(result).toBeNull();
    });

    it('getItems should return empty array', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      const result = await manager.getItems({ keys: ['k1'] });
      expect(result).toEqual([]);
    });

    it('setItem should do nothing', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      await expect(manager.setItem({ key: 'k', value: 'v' })).resolves.toBeUndefined();
    });

    it('deleteItem should do nothing', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      await expect(manager.deleteItem({ key: 'k' })).resolves.toBeUndefined();
    });

    it('hasItem should return false', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      const result = await manager.hasItem({ key: 'k' });
      expect(result).toBe(false);
    });

    it('getKeys should return empty array', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      const result = await manager.getKeys({});
      expect(result).toEqual([]);
    });

    it('clear should do nothing', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      await expect(manager.clear({})).resolves.toBeUndefined();
    });

    it('size should return 0', async () => {
      const manager = makeManager();
      vi.spyOn(manager, 'getStorage').mockReturnValue(undefined);
      const result = await manager.size({});
      expect(result).toBe(0);
    });
  });
});
