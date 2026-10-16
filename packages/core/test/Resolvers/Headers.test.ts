import { describe, expect, it } from 'vitest';
import { getRequestHeader, getRequestHeaders } from '../../src/Resolvers/Headers';
import type { RouterTypes } from '../../src/Types/RouterTypes';

describe('Headers Resolvers', () => {
  const createMockEvent = (headers?: Record<string, string>): RouterTypes.RouterEvent => {
    const requestHeaders = new Headers();

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        requestHeaders.set(key, value);
      }
    }

    return {
      request: new Request('http://localhost/test', {
        headers: requestHeaders,
      }),
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
    };
  };

  describe('getRequestHeader', () => {
    it('should retrieve a specific header value', () => {
      const event = createMockEvent({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      });

      const result = getRequestHeader('Content-Type', event);

      expect(result).toBe('application/json');
    });

    it('should retrieve authorization header', () => {
      const event = createMockEvent({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      });

      const result = getRequestHeader('Authorization', event);

      expect(result).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
    });

    it('should return undefined for non-existent header', () => {
      const event = createMockEvent({
        'Content-Type': 'application/json',
      });

      const result = getRequestHeader('X-Custom-Header', event);

      expect(result).toBeUndefined();
    });

    it('should handle case-insensitive header names', () => {
      const event = createMockEvent({
        'content-type': 'application/json',
        AUTHORIZATION: 'Bearer token123',
      });

      const result1 = getRequestHeader('Content-Type', event);
      const result2 = getRequestHeader('authorization', event);

      expect(result1).toBe('application/json');
      expect(result2).toBe('Bearer token123');
    });

    it('should handle empty header value', () => {
      const event = createMockEvent({
        'X-Custom-Header': '',
        'Content-Type': 'application/json',
      });

      const result = getRequestHeader('X-Custom-Header', event);

      expect(result).toBe('');
    });

    it('should handle request with no headers', () => {
      const event = createMockEvent();

      const result = getRequestHeader('Content-Type', event);

      expect(result).toBeUndefined();
    });

    it('should handle common HTTP headers', () => {
      const event = createMockEvent({
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Host: 'localhost:3000',
        Referer: 'http://localhost:3000/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });

      expect(getRequestHeader('Accept', event)).toBe('application/json, text/plain, */*');
      expect(getRequestHeader('Accept-Language', event)).toBe('en-US,en;q=0.9');
      expect(getRequestHeader('Accept-Encoding', event)).toBe('gzip, deflate, br');
      expect(getRequestHeader('Cache-Control', event)).toBe('no-cache');
      expect(getRequestHeader('Connection', event)).toBe('keep-alive');
      expect(getRequestHeader('Host', event)).toBe('localhost:3000');
      expect(getRequestHeader('Referer', event)).toBe('http://localhost:3000/');
      expect(getRequestHeader('User-Agent', event)).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    });

    it('should handle custom headers', () => {
      const event = createMockEvent({
        'X-API-Key': 'api-key-12345',
        'X-Request-ID': 'req-67890',
        'X-Correlation-ID': 'corr-abc123',
        'X-Forwarded-For': '192.168.1.1',
        'X-Real-IP': '192.168.1.1',
      });

      expect(getRequestHeader('X-API-Key', event)).toBe('api-key-12345');
      expect(getRequestHeader('X-Request-ID', event)).toBe('req-67890');
      expect(getRequestHeader('X-Correlation-ID', event)).toBe('corr-abc123');
      expect(getRequestHeader('X-Forwarded-For', event)).toBe('192.168.1.1');
      expect(getRequestHeader('X-Real-IP', event)).toBe('192.168.1.1');
    });

    it('should handle headers with special characters', () => {
      const event = createMockEvent({
        'X-Special-Header': 'value with spaces and special chars: !@#$%^&*()',
        'X-JSON-Header': '{"key": "value", "nested": {"array": [1,2,3]}}',
        'X-URL-Header': 'https://example.com/path?param=value&other=123',
      });

      expect(getRequestHeader('X-Special-Header', event)).toBe('value with spaces and special chars: !@#$%^&*()');
      expect(getRequestHeader('X-JSON-Header', event)).toBe('{"key": "value", "nested": {"array": [1,2,3]}}');
      expect(getRequestHeader('X-URL-Header', event)).toBe('https://example.com/path?param=value&other=123');
    });
  });

  describe('getRequestHeaders', () => {
    it('should return all headers as a plain object with lowercase names', () => {
      const event = createMockEvent({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      });
      const result = getRequestHeaders(event);

      expect(result).not.toBeInstanceOf(Headers);
      expect(result).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'x-custom-header': 'custom-value',
      });
      expect(result['x-custom-header']).toBe('custom-value');
      expect(JSON.stringify(result)).toBe(JSON.stringify(Object.fromEntries(Object.entries(result))));
    });

    it('should return an empty object for a request with no headers', () => {
      expect(getRequestHeaders(createMockEvent())).toEqual({});
    });
  });
});
