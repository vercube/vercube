import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('initialize', () => {
    it('should initialize without throwing any errors', () => {
      expect(() => storage.initialize()).not.toThrow();
    });
  });

  describe('setItem', () => {
    it('should store a value with a key', () => {
      storage.setItem('testKey', 'testValue');
      expect(storage.getItem('testKey')).toBe('testValue');
    });

    it('should store different types of values', () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        object: { key: 'value' },
        array: [1, 2, 3],
      };

      for (const [key, value] of Object.entries(testData)) {
        storage.setItem(key, value);
        expect(storage.getItem(key)).toEqual(value);
      }
    });

    it('should overwrite existing values', () => {
      storage.setItem('key', 'oldValue');
      storage.setItem('key', 'newValue');
      expect(storage.getItem('key')).toBe('newValue');
    });

    it('should handle options parameter', () => {
      storage.setItem('key', 'value', { ttl: 1000 });
      expect(storage.getItem('key')).toBe('value');
    });
  });

  describe('getItem', () => {
    it('should return undefined for non-existent key', () => {
      expect(storage.getItem('nonExistentKey')).toBeUndefined();
    });

    it('should return the correct type for stored values', () => {
      storage.setItem('number', 42);
      storage.setItem('string', 'test');
      storage.setItem('object', { key: 'value' });

      expect(storage.getItem<number>('number')).toBe(42);
      expect(storage.getItem<string>('string')).toBe('test');
      expect(storage.getItem<{ key: string }>('object')).toEqual({
        key: 'value',
      });
    });
  });

  describe('deleteItem', () => {
    it('should delete an existing item', () => {
      storage.setItem('key', 'value');
      storage.deleteItem('key');
      expect(storage.getItem('key')).toBeUndefined();
    });

    it('should not throw when deleting non-existent key', () => {
      expect(() => storage.deleteItem('nonExistentKey')).not.toThrow();
    });
  });

  describe('hasItem', () => {
    it('should return true for existing items', () => {
      storage.setItem('key', 'value');
      expect(storage.hasItem('key')).toBe(true);
    });

    it('should return false for non-existent items', () => {
      expect(storage.hasItem('nonExistentKey')).toBe(false);
    });
  });

  describe('getKeys', () => {
    it('should return empty array when storage is empty', () => {
      expect(storage.getKeys()).toEqual([]);
    });

    it('should return all stored keys', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.setItem('key3', 'value3');

      const keys = storage.getKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all items from storage', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.setItem('key3', 'value3');

      storage.clear();
      expect(storage.size()).toBe(0);
      expect(storage.getKeys()).toEqual([]);
    });

    it('should not throw when clearing empty storage', () => {
      expect(() => storage.clear()).not.toThrow();
    });
  });

  describe('size', () => {
    it('should return 0 for empty storage', () => {
      expect(storage.size()).toBe(0);
    });

    it('should return correct number of items', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.setItem('key3', 'value3');

      expect(storage.size()).toBe(3);
    });

    it('should update size after deletions', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.setItem('key3', 'value3');

      expect(storage.size()).toBe(3);

      storage.deleteItem('key2');
      expect(storage.size()).toBe(2);

      storage.clear();
      expect(storage.size()).toBe(0);
    });
  });
});
