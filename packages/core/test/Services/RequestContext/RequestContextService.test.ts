import { beforeEach, describe, expect, it } from 'vitest';
import { RequestContextService } from '../../../src/Services/RequestContext/RequestContextService';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  describe('run', () => {
    it('should run function within context', async () => {
      const result = await service.run(async () => {
        service.set('test', 'value');
        return service.get('test');
      });

      expect(result).toBe('value');
    });

    it('should isolate context between different runs', async () => {
      const result1 = await service.run(async () => {
        service.set('key1', 'value1');
        return service.get('key1');
      });

      const result2 = await service.run(async () => {
        service.set('key2', 'value2');
        return service.get('key1'); // Should be undefined in new context
      });

      expect(result1).toBe('value1');
      expect(result2).toBeUndefined();
    });

    it('should propagate context through async operations', async () => {
      const result = await service.run(async () => {
        service.set('test', 'value');

        const nested = await Promise.resolve().then(async () => {
          return service.get('test');
        });

        return nested;
      });

      expect(result).toBe('value');
    });

    it('should clean up context after function completes', async () => {
      await service.run(async () => {
        service.set('test', 'value');
      });

      // Context should be cleaned up, so accessing outside should throw
      expect(() => {
        service.get('test');
      }).toThrow('RequestContextService.get() called outside of request context');
    });

    it('should handle errors and still clean up context', async () => {
      await expect(
        service.run(async () => {
          service.set('test', 'value');
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      // Context should still be cleaned up even after error
      expect(() => {
        service.get('test');
      }).toThrow('RequestContextService.get() called outside of request context');
    });

    it('should return the result of the function', async () => {
      const result = await service.run(async () => {
        return 'test result';
      });

      expect(result).toBe('test result');
    });
  });

  describe('set', () => {
    it('should set value in context', async () => {
      await service.run(async () => {
        service.set('key', 'value');
        expect(service.get('key')).toBe('value');
      });
    });

    it('should overwrite existing value', async () => {
      await service.run(async () => {
        service.set('key', 'value1');
        service.set('key', 'value2');
        expect(service.get('key')).toBe('value2');
      });
    });

    it('should throw error when called outside context', () => {
      expect(() => {
        service.set('key', 'value');
      }).toThrow('RequestContextService.set() called outside of request context');
    });

    it('should handle different value types', async () => {
      await service.run(async () => {
        service.set('string', 'test');
        service.set('number', 123);
        service.set('boolean', true);
        service.set('object', { key: 'value' });
        service.set('array', [1, 2, 3]);
        service.set('null', null);
        service.set('undefined', undefined);

        expect(service.get('string')).toBe('test');
        expect(service.get('number')).toBe(123);
        expect(service.get('boolean')).toBe(true);
        expect(service.get('object')).toEqual({ key: 'value' });
        expect(service.get('array')).toEqual([1, 2, 3]);
        expect(service.get('null')).toBeNull();
        expect(service.get('undefined')).toBeUndefined();
      });
    });
  });

  describe('get', () => {
    it('should get value from context', async () => {
      await service.run(async () => {
        service.set('key', 'value');
        expect(service.get('key')).toBe('value');
      });
    });

    it('should return undefined for non-existent key', async () => {
      await service.run(async () => {
        expect(service.get('non-existent')).toBeUndefined();
      });
    });

    it('should throw error when called outside context', () => {
      expect(() => {
        service.get('key');
      }).toThrow('RequestContextService.get() called outside of request context');
    });

    it('should preserve type information', async () => {
      await service.run(async () => {
        service.set('number', 123);
        const value = service.get<number>('number');
        expect(typeof value).toBe('number');
        expect(value).toBe(123);
      });
    });
  });

  describe('getOrDefault', () => {
    it('should get value when key exists', async () => {
      await service.run(async () => {
        service.set('key', 'value');
        expect(service.getOrDefault('key', 'default')).toBe('value');
      });
    });

    it('should return default value when key does not exist', async () => {
      await service.run(async () => {
        expect(service.getOrDefault('non-existent', 'default')).toBe('default');
      });
    });

    it('should return default value when value is undefined', async () => {
      await service.run(async () => {
        service.set('key', undefined);
        expect(service.getOrDefault('key', 'default')).toBe('default');
      });
    });

    it('should not return default value when value is null', async () => {
      await service.run(async () => {
        service.set('key', null);
        expect(service.getOrDefault('key', 'default')).toBeNull();
      });
    });
  });

  describe('has', () => {
    it('should return true when key exists', async () => {
      await service.run(async () => {
        service.set('key', 'value');
        expect(service.has('key')).toBe(true);
      });
    });

    it('should return false when key does not exist', async () => {
      await service.run(async () => {
        expect(service.has('non-existent')).toBe(false);
      });
    });

    it('should return false when called outside context', () => {
      expect(service.has('key')).toBe(false);
    });

    it('should return true even when value is null', async () => {
      await service.run(async () => {
        service.set('key', null);
        expect(service.has('key')).toBe(true);
      });
    });

    it('should return true even when value is undefined', async () => {
      await service.run(async () => {
        service.set('key', undefined);
        expect(service.has('key')).toBe(true);
      });
    });
  });

  describe('keys', () => {
    it('should return all keys in context', async () => {
      await service.run(async () => {
        service.set('key1', 'value1');
        service.set('key2', 'value2');
        service.set('key3', 'value3');

        const keys = service.keys();
        expect(keys).toHaveLength(3);
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toContain('key3');
      });
    });

    it('should return empty array when context is empty', async () => {
      await service.run(async () => {
        expect(service.keys()).toEqual([]);
      });
    });

    it('should return empty array when called outside context', () => {
      expect(service.keys()).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should return all key-value pairs', async () => {
      await service.run(async () => {
        service.set('key1', 'value1');
        service.set('key2', 'value2');

        const all = service.getAll();
        expect(all.size).toBe(2);
        expect(all.get('key1')).toBe('value1');
        expect(all.get('key2')).toBe('value2');
      });
    });

    it('should return empty map when context is empty', async () => {
      await service.run(async () => {
        const all = service.getAll();
        expect(all.size).toBe(0);
      });
    });

    it('should return empty map when called outside context', () => {
      const all = service.getAll();
      expect(all.size).toBe(0);
    });

    it('should return a copy of the context', async () => {
      await service.run(async () => {
        service.set('key', 'value');
        const all = service.getAll();
        all.set('newKey', 'newValue');

        // Original context should not be modified
        expect(service.has('newKey')).toBe(false);
      });
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent requests with isolated contexts', async () => {
      const results = await Promise.all([
        service.run(async () => {
          service.set('requestId', 'request1');
          await new Promise((resolve) => setTimeout(resolve, 10));
          return service.get('requestId');
        }),
        service.run(async () => {
          service.set('requestId', 'request2');
          await new Promise((resolve) => setTimeout(resolve, 10));
          return service.get('requestId');
        }),
        service.run(async () => {
          service.set('requestId', 'request3');
          await new Promise((resolve) => setTimeout(resolve, 10));
          return service.get('requestId');
        }),
      ]);

      expect(results).toEqual(['request1', 'request2', 'request3']);
    });

    it('should not leak context between concurrent requests', async () => {
      await Promise.all([
        service.run(async () => {
          service.set('key1', 'value1');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }),
        service.run(async () => {
          service.set('key2', 'value2');
          await new Promise((resolve) => setTimeout(resolve, 10));
          // Should not have access to key1 from other request
          expect(service.get('key1')).toBeUndefined();
        }),
      ]);
    });
  });
});
