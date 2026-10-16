import { describe, expect, it } from 'vitest';
import { PayloadTooLargeError } from '../../src/Errors/Http/PayloadTooLargeError';
import { UnsupportedMediaTypeError } from '../../src/Errors/Http/UnsupportedMediaTypeError';
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
      // Verify no prototype pollution occurred
      expect(({} as any).isAdmin).toBeUndefined();
      // Verify __proto__ wasn't set as own property
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
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
      // Verify constructor wasn't set as own property
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
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
      // Verify no prototype pollution occurred
      expect(({} as any).isAdmin).toBeUndefined();
      // Verify __proto__ wasn't set as own property on nested object
      expect(Object.prototype.hasOwnProperty.call((result as any).user, '__proto__')).toBe(false);
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

  describe('exception contract', () => {
    it('should reject rather than throw when the body has already been consumed', async () => {
      // `clone()` throws synchronously on a used body, and this used to be an
      // `async` function, so callers are entitled to a rejection.
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      });
      await request.text();

      const event = createMockEvent(request);
      let threw = false;
      let result: Promise<unknown> | undefined;

      try {
        result = resolveRequestBody(event);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeInstanceOf(Promise);
      await expect(result).rejects.toThrow();
    });
  });

  describe('content types', () => {
    const post = (body: BodyInit, contentType?: string, headers: Record<string, string> = {}): Request =>
      new Request('http://localhost/test', {
        method: 'POST',
        body,
        headers: contentType ? { 'Content-Type': contentType, ...headers } : headers,
      });

    it('should parse urlencoded bodies, repeated keys become arrays', async () => {
      const result = await resolveRequestBody(
        createMockEvent(post('a=1&b=2&b=3&__proto__=x', 'application/x-www-form-urlencoded')),
      );

      expect(result).toEqual({ a: '1', b: ['2', '3'] });
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it('should not treat Object.prototype members as existing urlencoded fields', async () => {
      const result = await resolveRequestBody(createMockEvent(post('toString=1', 'application/x-www-form-urlencoded')));

      expect(result).toEqual({ toString: '1' });
    });

    it('should return text bodies as is', async () => {
      const result = await resolveRequestBody(createMockEvent(post('{not json', 'text/plain; charset=utf-8')));

      expect(result).toBe('{not json');
    });

    it('should parse +json media types as JSON', async () => {
      const result = await resolveRequestBody(createMockEvent(post('{"a":1}', 'application/merge-patch+json')));

      expect(result).toEqual({ a: 1 });
    });

    it('should reject unsupported media types with 415', async () => {
      await expect(resolveRequestBody(createMockEvent(post('<a/>', 'application/xml')))).rejects.toBeInstanceOf(
        UnsupportedMediaTypeError,
      );
    });

    it('should resolve undefined for an unsupported media type without a body', async () => {
      const request = new Request('http://localhost/test', { method: 'GET', headers: { 'Content-Type': 'application/xml' } });

      await expect(resolveRequestBody(createMockEvent(request))).resolves.toBeUndefined();
    });
  });

  describe('body limit', () => {
    const withLimit = (request: Request, bodyLimit: number): RouterTypes.RouterEvent => ({
      ...createMockEvent(request),
      bodyLimit,
    });

    it('should reject a declared Content-Length over the limit without reading', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '100' },
      });

      await expect(resolveRequestBody(withLimit(request, 10))).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it('should reject a streamed body once it crosses the limit', async () => {
      const chunk = new TextEncoder().encode('"' + 'a'.repeat(8) + '"');
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      });
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: stream,
        headers: { 'Content-Type': 'application/json' },
        duplex: 'half',
      } as RequestInit);

      await expect(resolveRequestBody(withLimit(request, 15))).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it('should read a body within the limit', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json' },
      });

      await expect(resolveRequestBody(withLimit(request, 100))).resolves.toEqual({ a: 1 });
    });

    it('should read a body with a declared length within the limit', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '7' },
      });

      await expect(resolveRequestBody(withLimit(request, 100))).resolves.toEqual({ a: 1 });
    });
  });
});
