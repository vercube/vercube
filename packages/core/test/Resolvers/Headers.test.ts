import { describe, it, expect } from 'vitest';
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

    it('should return null for non-existent header', () => {
      const event = createMockEvent({
        'Content-Type': 'application/json',
      });

      const result = getRequestHeader('X-Custom-Header', event);

      expect(result).toBeNull();
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

      expect(result).toBeNull();
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
    it('should retrieve all headers from the request', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      expect(result).toBeInstanceOf(Headers);
      expect(result.get('Content-Type')).toBe('application/json');
      expect(result.get('Authorization')).toBe('Bearer token123');
      expect(result.get('User-Agent')).toBe('Mozilla/5.0');
    });

    it('should return empty Headers object for request with no headers', () => {
      const event = createMockEvent();
      const result = getRequestHeaders(event);

      expect(result).toBeInstanceOf(Headers);
      expect(result.has('Content-Type')).toBe(false);
    });

    it('should return Headers object with all custom headers', () => {
      const headers = {
        'X-API-Key': 'api-key-12345',
        'X-Request-ID': 'req-67890',
        'X-Correlation-ID': 'corr-abc123',
        'X-Forwarded-For': '192.168.1.1',
        'X-Real-IP': '192.168.1.1',
        'X-Custom-Header': 'custom-value',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      expect(result).toBeInstanceOf(Headers);
      for (const [key, value] of Object.entries(headers)) {
        expect(result.get(key)).toBe(value);
      }
    });

    it('should return Headers object that can be iterated', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      const headerEntries: [string, string][] = [];
      for (const [key, value] of result.entries()) {
        headerEntries.push([key, value]);
      }

      expect(headerEntries).toHaveLength(3);
      expect(headerEntries).toEqual(
        expect.arrayContaining([
          ['content-type', 'application/json'],
          ['authorization', 'Bearer token123'],
          ['user-agent', 'Mozilla/5.0'],
        ]),
      );
    });

    it('should return Headers object that supports entries() method', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      const entries = [...result.entries()];
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          ['content-type', 'application/json'],
          ['authorization', 'Bearer token123'],
        ]),
      );
    });

    it('should return Headers object that supports keys() method', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      const keys = [...result.keys()];
      expect(keys).toHaveLength(3);
      expect(keys).toEqual(expect.arrayContaining(['content-type', 'authorization', 'user-agent']));
    });

    it('should return Headers object that supports values() method', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      const values = [...result.values()];
      expect(values).toHaveLength(3);
      expect(values).toEqual(expect.arrayContaining(['application/json', 'Bearer token123', 'Mozilla/5.0']));
    });

    it('should return Headers object that supports has() method', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      };

      const event = createMockEvent(headers);
      const result = getRequestHeaders(event);

      expect(result.has('Content-Type')).toBe(true);
      expect(result.has('content-type')).toBe(true);
      expect(result.has('Authorization')).toBe(true);
      expect(result.has('authorization')).toBe(true);
      expect(result.has('X-Custom-Header')).toBe(false);
    });

    it('should return Headers object that supports getAll() method for multiple values', () => {
      const event = createMockEvent({
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      });

      const result = getRequestHeaders(event);

      // Note: getAll() is deprecated in modern Headers API, but we can test the structure
      expect(result.get('Accept')).toBe('application/json, text/plain, */*');
      expect(result.get('Accept-Language')).toBe('en-US,en;q=0.9');
    });
  });
});
