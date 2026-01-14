import { describe, expect, it } from 'vitest';
import {
  DANGEROUS_PROPERTIES,
  isSafeProperty,
  safeAssign,
  safeJsonParse,
  sanitizeObject,
  secureReviver,
} from '../../src/Utils/Security';

describe('Security utilities for prototype pollution protection', () => {
  describe('DANGEROUS_PROPERTIES', () => {
    it('should contain all dangerous property names', () => {
      expect(DANGEROUS_PROPERTIES).toEqual(['__proto__', 'constructor', 'prototype']);
    });

    it('should be frozen to prevent modification', () => {
      expect(Object.isFrozen(DANGEROUS_PROPERTIES)).toBe(true);
    });
  });

  describe('isSafeProperty', () => {
    it('should return true for safe property names', () => {
      expect(isSafeProperty('name')).toBe(true);
      expect(isSafeProperty('age')).toBe(true);
      expect(isSafeProperty('email')).toBe(true);
      expect(isSafeProperty('data')).toBe(true);
      expect(isSafeProperty('isAdmin')).toBe(true);
    });

    it('should return false for __proto__', () => {
      expect(isSafeProperty('__proto__')).toBe(false);
    });

    it('should return false for constructor', () => {
      expect(isSafeProperty('constructor')).toBe(false);
    });

    it('should return false for prototype', () => {
      expect(isSafeProperty('prototype')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isSafeProperty('')).toBe(true);
    });
  });

  describe('secureReviver', () => {
    it('should return value for safe properties', () => {
      expect(secureReviver('name', 'John')).toBe('John');
      expect(secureReviver('age', 30)).toBe(30);
      expect(secureReviver('active', true)).toBe(true);
    });

    it('should return undefined for __proto__', () => {
      expect(secureReviver('__proto__', { isAdmin: true })).toBeUndefined();
    });

    it('should return undefined for constructor', () => {
      expect(secureReviver('constructor', { prototype: {} })).toBeUndefined();
    });

    it('should return undefined for prototype', () => {
      expect(secureReviver('prototype', { polluted: true })).toBeUndefined();
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON objects', () => {
      const result = safeJsonParse('{"name":"John","age":30}');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should parse valid JSON arrays', () => {
      const result = safeJsonParse('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter out __proto__ during parsing', () => {
      const malicious = '{"name":"John","__proto__":{"isAdmin":true}}';
      const result = safeJsonParse(malicious) as any;

      expect(result.name).toBe('John');
      // The important check: verify that __proto__ didn't pollute Object.prototype
      expect(({} as any).isAdmin).toBeUndefined();
      // And verify that the malicious property itself doesn't exist as own property
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    });

    it('should filter out constructor during parsing', () => {
      const malicious = '{"name":"John","constructor":{"prototype":{"polluted":true}}}';
      const result = safeJsonParse(malicious) as any;

      expect(result.name).toBe('John');
      // Verify that the constructor property wasn't set as an own property
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
    });

    it('should filter out prototype during parsing', () => {
      const malicious = '{"name":"John","prototype":{"polluted":true}}';
      const result = safeJsonParse(malicious) as any;

      expect(result.name).toBe('John');
      expect(result.prototype).toBeUndefined();
    });

    it('should prevent nested prototype pollution attempts', () => {
      const malicious = '{"user":{"name":"John","__proto__":{"isAdmin":true}}}';
      const result = safeJsonParse(malicious) as any;

      expect(result.user.name).toBe('John');
      // Verify no prototype pollution occurred
      expect(({} as any).isAdmin).toBeUndefined();
      // Verify __proto__ wasn't set as own property on the nested object
      expect(Object.prototype.hasOwnProperty.call(result.user, '__proto__')).toBe(false);
    });

    it('should throw SyntaxError for invalid JSON', () => {
      expect(() => safeJsonParse('invalid json')).toThrow(SyntaxError);
      expect(() => safeJsonParse('{"name": "John"')).toThrow(SyntaxError);
    });

    it('should handle complex nested objects safely', () => {
      const json = `{
        "data": {
          "user": {
            "name": "John",
            "preferences": {
              "theme": "dark"
            }
          }
        }
      }`;
      const result = safeJsonParse(json) as any;

      expect(result.data.user.name).toBe('John');
      expect(result.data.user.preferences.theme).toBe('dark');
    });

    it('should not affect prototype of global Object after parsing malicious JSON', () => {
      const originalPrototype = Object.prototype;
      const malicious = '{"__proto__":{"polluted":true}}';

      safeJsonParse(malicious);

      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(Object.prototype).toBe(originalPrototype);
    });
  });

  describe('sanitizeObject', () => {
    it('should copy safe properties', () => {
      const unsafe = { name: 'John', age: 30, email: 'john@example.com' };
      const result = sanitizeObject(unsafe);

      expect(result).toEqual({ name: 'John', age: 30, email: 'john@example.com' });
    });

    it('should filter out __proto__ property', () => {
      const unsafe = { name: 'John', __proto__: { isAdmin: true } } as any;
      const result = sanitizeObject(unsafe);

      expect(result.name).toBe('John');
      // Verify no prototype pollution occurred
      expect((result as any).isAdmin).toBeUndefined();
      // Verify __proto__ wasn't set as own property
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    });

    it('should filter out constructor property', () => {
      const unsafe = { name: 'John', constructor: { prototype: { polluted: true } } } as any;
      const result = sanitizeObject(unsafe);

      expect(result.name).toBe('John');
      expect(result.constructor).not.toEqual({ prototype: { polluted: true } });
    });

    it('should filter out prototype property', () => {
      const unsafe = { name: 'John', prototype: { polluted: true } } as any;
      const result = sanitizeObject(unsafe);

      expect(result.name).toBe('John');
      expect((result as any).prototype).toBeUndefined();
    });

    it('should only copy own properties', () => {
      class Base {
        baseProperty = 'base';
      }
      class Extended extends Base {
        ownProperty = 'own';
      }

      const unsafe = new Extended();
      const result = sanitizeObject(unsafe as any);

      expect(result.ownProperty).toBe('own');
      expect(result.baseProperty).toBe('base');
    });

    it('should handle empty objects', () => {
      const result = sanitizeObject({});
      expect(result).toEqual({});
    });

    it('should not pollute Object.prototype', () => {
      const unsafe = { __proto__: { polluted: true } } as any;
      sanitizeObject(unsafe);

      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('safeAssign', () => {
    it('should assign safe properties to target', () => {
      const target = { existing: 'value' };
      const source = { name: 'John', age: 30 };

      safeAssign(target, source);

      expect(target).toEqual({ existing: 'value', name: 'John', age: 30 });
    });

    it('should not assign __proto__ to target', () => {
      const target = {} as any;
      const source = { name: 'John', __proto__: { isAdmin: true } } as any;

      safeAssign(target, source);

      expect(target.name).toBe('John');
      expect(target.__proto__).not.toEqual({ isAdmin: true });
      expect(target.isAdmin).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('should not assign constructor to target', () => {
      const target = {} as any;
      const source = { name: 'John', constructor: { prototype: { polluted: true } } } as any;

      safeAssign(target, source);

      expect(target.name).toBe('John');
      // constructor is a built-in property, it shouldn't be overwritten with the malicious value
      expect(target.constructor).not.toEqual({ prototype: { polluted: true } });
    });

    it('should not assign prototype to target', () => {
      const target = {} as any;
      const source = { name: 'John', prototype: { polluted: true } } as any;

      safeAssign(target, source);

      expect(target.name).toBe('John');
      expect(target.prototype).toBeUndefined();
    });

    it('should only assign own properties', () => {
      const target = {} as any;
      const parent = { inherited: 'parent' };
      const source = Object.create(parent);
      source.own = 'child';

      safeAssign(target, source);

      expect(target.own).toBe('child');
      expect(target.inherited).toBeUndefined();
    });

    it('should handle empty source objects', () => {
      const target = { existing: 'value' };
      safeAssign(target, {});

      expect(target).toEqual({ existing: 'value' });
    });

    it('should not pollute Object.prototype via target', () => {
      const target = {};
      const source = { __proto__: { polluted: true } } as any;

      safeAssign(target, source);

      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Integration tests for prototype pollution prevention', () => {
    it('should prevent pollution through multiple attack vectors', () => {
      // Attempt 1: Direct __proto__ in JSON
      const json1 = '{"__proto__":{"polluted1":true}}';
      safeJsonParse(json1);
      expect((Object.prototype as any).polluted1).toBeUndefined();

      // Attempt 2: Constructor.prototype in JSON
      const json2 = '{"constructor":{"prototype":{"polluted2":true}}}';
      safeJsonParse(json2);
      expect((Object.prototype as any).polluted2).toBeUndefined();

      // Attempt 3: Object sanitization
      const obj = { __proto__: { polluted3: true } } as any;
      sanitizeObject(obj);
      expect((Object.prototype as any).polluted3).toBeUndefined();

      // Attempt 4: Safe assignment
      const target = {};
      const source = { __proto__: { polluted4: true } } as any;
      safeAssign(target, source);
      expect((Object.prototype as any).polluted4).toBeUndefined();

      // Verify Object.prototype remains clean
      const cleanObject = {};
      expect((cleanObject as any).polluted1).toBeUndefined();
      expect((cleanObject as any).polluted2).toBeUndefined();
      expect((cleanObject as any).polluted3).toBeUndefined();
      expect((cleanObject as any).polluted4).toBeUndefined();
    });
  });
});
