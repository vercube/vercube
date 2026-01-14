import { describe, expect, it } from 'vitest';
import { resolveRequestBody } from '../../src/Resolvers/Body';
import type { RouterTypes } from '../../src/Types/RouterTypes';

describe('resolveRequestBody', () => {
  const createMockEvent = (request: Request): RouterTypes.RouterEvent => ({
    request,
    response: new Response(),
    data: {
      instance: {},
      propertyName: 'test',
      args: [],
      middlewares: {
        beforeMiddlewares: [],
        afterMiddlewares: [],
      },
      actions: [],
    },
  });

  describe('valid JSON body', () => {
    it('should parse valid JSON object', async () => {
      const jsonData = { name: 'John', age: 30, active: true };
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(jsonData),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual(jsonData);
    });

    it('should parse valid JSON array', async () => {
      const jsonData = [1, 2, 3, 'test', { nested: true }];
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(jsonData),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual(jsonData);
    });

    it('should parse primitive JSON values', async () => {
      const testCases = [
        { value: 'string', expected: 'string' },
        { value: 123, expected: 123 },
        { value: true, expected: true },
        { value: false, expected: false },
        { value: null, expected: null },
      ];

      for (const { value, expected } of testCases) {
        const request = new Request('http://localhost/test', {
          method: 'POST',
          body: JSON.stringify(value),
          headers: { 'Content-Type': 'application/json' },
        });

        const event = createMockEvent(request);
        const result = await resolveRequestBody(event);

        expect(result).toBe(expected);
      }
    });

    it('should parse nested JSON objects', async () => {
      const jsonData = {
        user: {
          id: 1,
          profile: {
            name: 'John',
            preferences: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        metadata: {
          tags: ['important', 'urgent'],
          created: '2023-01-01',
        },
      };

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(jsonData),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual(jsonData);
    });
  });

  describe('empty body', () => {
    it('should return undefined for empty body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '',
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toBeUndefined();
    });

    it('should return undefined for request with no body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'GET',
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toBeUndefined();
    });

    it('should throw BadRequestError for whitespace-only body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '   \n\t  ',
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });
  });

  describe('invalid JSON', () => {
    it('should throw BadRequestError for malformed JSON object', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{ "name": "John", "age": 30, }', // Missing value after comma
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for incomplete JSON', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{ "name": "John"', // Missing closing brace
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for missing closing quote', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"name": "John", "age": "30}', // Missing closing quote
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for missing quotes around key', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"name": "John", age: 30}', // Missing quotes around key
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for trailing comma', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"name": "John", "age": 30,}', // Trailing comma
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for missing value', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"name": "John", "age": 30, "active":}', // Missing value
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for incomplete nested object', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"name": "John", "age": 30, "nested": {"key":}}', // Incomplete nested object
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for non-JSON text', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: 'This is not JSON at all',
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });

    it('should throw BadRequestError for HTML content', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '<html><body><h1>Hello World</h1></body></html>',
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);

      await expect(resolveRequestBody(event)).rejects.toThrow('Invalid JSON body');
    });
  });

  describe('edge cases', () => {
    it('should handle very large JSON objects', async () => {
      const largeObject = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random(),
        })),
      };

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(largeObject),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual(largeObject);
      expect((result as any).data).toHaveLength(1000);
    });

    it('should handle JSON with special characters', async () => {
      const jsonData = {
        message: 'Hello "World" with quotes',
        path: 'C:\\Users\\John\\Documents',
        unicode: '🎉🚀✨',
        newlines: 'Line 1\nLine 2\r\nLine 3',
        tabs: 'Tab\tSeparated\tValues',
      };

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(jsonData),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual(jsonData);
    });

    it('should handle JSON with null and undefined values', async () => {
      const jsonData = {
        nullValue: null,
        undefinedValue: undefined, // This will be omitted in JSON.stringify
        emptyString: '',
        zero: 0,
        falseValue: false,
      };

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(jsonData),
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect(result).toEqual({
        nullValue: null,
        emptyString: '',
        zero: 0,
        falseValue: false,
      });
    });
  });

  describe('prototype pollution protection', () => {
    it('should filter out __proto__ from request body', async () => {
      const maliciousJson = JSON.stringify({
        name: 'John',
        __proto__: { isAdmin: true },
      });

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: maliciousJson,
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect((result as any).name).toBe('John');
      expect((result as any).__proto__).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('should filter out constructor from request body', async () => {
      const maliciousJson = JSON.stringify({
        name: 'John',
        constructor: { prototype: { polluted: true } },
      });

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: maliciousJson,
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect((result as any).name).toBe('John');
      expect((result as any).constructor).toBeUndefined();
    });

    it('should filter out prototype from request body', async () => {
      const maliciousJson = JSON.stringify({
        name: 'John',
        prototype: { polluted: true },
      });

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: maliciousJson,
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect((result as any).name).toBe('John');
      expect((result as any).prototype).toBeUndefined();
    });

    it('should prevent nested prototype pollution attempts', async () => {
      const maliciousJson = JSON.stringify({
        user: {
          name: 'John',
          __proto__: { isAdmin: true },
        },
      });

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: maliciousJson,
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      const result = await resolveRequestBody(event);

      expect((result as any).user.name).toBe('John');
      expect((result as any).user.__proto__).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('should not pollute Object.prototype after parsing malicious JSON', async () => {
      const maliciousJson = JSON.stringify({
        __proto__: { polluted: true },
      });

      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: maliciousJson,
        headers: { 'Content-Type': 'application/json' },
      });

      const event = createMockEvent(request);
      await resolveRequestBody(event);

      expect((Object.prototype as any).polluted).toBeUndefined();
      const newObj = {};
      expect((newObj as any).polluted).toBeUndefined();
    });
  });
});
