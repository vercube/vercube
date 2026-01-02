import { describe, expect, it } from 'vitest';
import { cookiesFromHeaders, parseCookieString } from '../../src/Adapters/azure-functions/Utils/Utils';
import { headersToObject, streamToAsyncIterator } from '../../src/Utils';

describe('[Azure Functions] Utils', () => {
  describe('streamToAsyncIterator', () => {
    it('should convert ReadableStream to AsyncIterableIterator', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Hello'));
          controller.enqueue(new TextEncoder().encode('World'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);

      expect(iterator).toBeDefined();
      expect(iterator).toHaveProperty('next');
      expect(iterator).toHaveProperty('return');
      expect(iterator![Symbol.asyncIterator]).toBeDefined();
    });

    it('should return null for null input', () => {
      const iterator = streamToAsyncIterator(null);

      expect(iterator).toBeNull();
    });

    it('should return null for undefined input', () => {
      const iterator = streamToAsyncIterator(undefined as any);

      expect(iterator).toBeNull();
    });

    it('should provide async iteration capability', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(new TextDecoder().decode(chunks[0])).toBe('chunk1');
      expect(new TextDecoder().decode(chunks[1])).toBe('chunk2');
    });

    it('should handle empty stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(0);
    });

    it('should handle stream with single chunk', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('single chunk'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(new TextDecoder().decode(chunks[0])).toBe('single chunk');
    });

    it('should handle stream with large data', async () => {
      const largeData = 'x'.repeat(10_000);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(largeData));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(new TextDecoder().decode(chunks[0])).toBe(largeData);
    });

    it('should handle stream with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(binaryData);
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(binaryData);
    });
  });

  describe('headersToObject', () => {
    it('should convert headers with forEach to object', () => {
      const mockHeaders = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('application/json', 'content-type');
          callback('Bearer token123', 'authorization');
          callback('custom-value', 'x-custom-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'x-custom-header': 'custom-value',
      });
    });

    it('should handle empty headers', () => {
      const mockHeaders = {
        // oxlint-disable-next-line no-unused-vars
        forEach: (callback: (value: string, key: string) => void) => {
          // No headers
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({});
    });

    it('should handle headers with special characters', () => {
      const mockHeaders = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('value with spaces and symbols!@#$%', 'x-special-header');
          callback('value,with,commas', 'x-comma-header');
          callback('value\nwith\nnewlines', 'x-newline-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'x-special-header': 'value with spaces and symbols!@#$%',
        'x-comma-header': 'value,with,commas',
        'x-newline-header': 'value\nwith\nnewlines',
      });
    });

    it('should handle headers with case variations', () => {
      const mockHeaders = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('application/json', 'Content-Type');
          callback('Bearer token', 'AUTHORIZATION');
          callback('custom-value', 'X-Custom-Header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'Content-Type': 'application/json',
        AUTHORIZATION: 'Bearer token',
        'X-Custom-Header': 'custom-value',
      });
    });

    it('should handle headers with empty values', () => {
      const mockHeaders = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('', 'empty-header');
          callback('valid-value', 'valid-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'empty-header': '',
        'valid-header': 'valid-value',
      });
    });

    it('should handle headers with numeric values', () => {
      const mockHeaders = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('123', 'content-length');
          callback('3600', 'cache-control');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'content-length': '123',
        'cache-control': '3600',
      });
    });
  });

  describe('cookiesFromHeaders', () => {
    it('should extract cookies from Headers object', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'sessionId=abc123; HttpOnly; Secure');
      headers.append('Set-Cookie', 'theme=dark; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(2);
      expect(cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
      expect(cookies![1]).toEqual({
        name: 'theme',
        value: 'dark',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should return undefined when no cookies are present', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toBeUndefined();
    });

    it('should handle empty Headers object', () => {
      const headers = new Headers();

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toBeUndefined();
    });

    it('should handle cookies with all attributes', () => {
      const headers = new Headers();
      headers.set(
        'Set-Cookie',
        'sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=.example.com; Max-Age=3600; Expires=Wed, 09 Jun 2021 10:18:14 GMT',
      );

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        domain: '.example.com',
        maxAge: 3600,
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
      });
    });

    it('should handle cookies with minimal attributes', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'simple=value');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'simple',
        value: 'value',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with URL-encoded values', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'user=John%20Doe; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'user',
        value: 'John Doe',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with special characters in names', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'user-name=value; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'user-name',
        value: 'value',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with boolean attributes', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'secure=value; Secure; HttpOnly');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'secure',
        value: 'value',
        secure: true,
        httpOnly: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
    });

    it('should handle cookies with SameSite attribute', () => {
      const sameSiteValues = ['Strict', 'Lax', 'None'];

      for (const sameSite of sameSiteValues) {
        const headers = new Headers();
        headers.set('Set-Cookie', `cookie=value; SameSite=${sameSite}`);

        const cookies = cookiesFromHeaders(headers);

        expect(cookies).toHaveLength(1);
        expect(cookies![0].sameSite).toBe(sameSite);
      }
    });
  });

  describe('parseCookieString', () => {
    it('should parse simple cookie string', () => {
      const cookieString = 'sessionId=abc123';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with path attribute', () => {
      const cookieString = 'sessionId=abc123; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with secure attribute', () => {
      const cookieString = 'sessionId=abc123; Secure';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        secure: true,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
    });

    it('should parse cookie with httpOnly attribute', () => {
      const cookieString = 'sessionId=abc123; HttpOnly';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with domain attribute', () => {
      const cookieString = 'sessionId=abc123; Domain=.example.com';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        domain: '.example.com',
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with maxAge attribute', () => {
      const cookieString = 'sessionId=abc123; Max-Age=3600';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: 3600,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with expires attribute', () => {
      const cookieString = 'sessionId=abc123; Expires=Wed, 09 Jun 2021 10:18:14 GMT';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
        domain: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with SameSite attribute', () => {
      const cookieString = 'sessionId=abc123; SameSite=Strict';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        sameSite: 'Strict',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        secure: false,
      });
    });

    it('should parse cookie with all attributes', () => {
      const cookieString =
        'sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=.example.com; Max-Age=3600; Expires=Wed, 09 Jun 2021 10:18:14 GMT';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        domain: '.example.com',
        maxAge: 3600,
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
      });
    });

    it('should handle URL-encoded cookie values', () => {
      const cookieString = 'user=John%20Doe%40example.com; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'user',
        value: 'John Doe@example.com',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with special characters in names', () => {
      const cookieString = 'user-name=value; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'user-name',
        value: 'value',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with empty values', () => {
      const cookieString = 'empty=; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'empty',
        value: '',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with boolean attributes in different cases', () => {
      const cookieString = 'sessionId=abc123; secure; httponly';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        secure: true,
        httpOnly: true,
      });
    });

    it('should handle cookies with SameSite in different cases', () => {
      const cookieString = 'sessionId=abc123; samesite=lax';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        sameSite: 'lax',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        secure: false,
      });
    });

    it('should handle cookies with numeric maxAge', () => {
      const cookieString = 'sessionId=abc123; max-age=7200';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: 7200,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with invalid maxAge gracefully', () => {
      const cookieString = 'sessionId=abc123; max-age=invalid';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: Number.NaN,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with invalid expires gracefully', () => {
      const cookieString = 'sessionId=abc123; expires=invalid-date';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        expires: new Date(Number.NaN),
        domain: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should throw error for invalid cookie string', () => {
      expect(() => {
        parseCookieString('');
      }).toThrow('Invalid cookie string: must be a non-empty string');

      expect(() => {
        parseCookieString(null as any);
      }).toThrow('Invalid cookie string: must be a non-empty string');

      expect(() => {
        parseCookieString(undefined as any);
      }).toThrow('Invalid cookie string: must be a non-empty string');
    });

    it('should throw error for cookie string without name', () => {
      expect(() => {
        parseCookieString('=value');
      }).toThrow('Invalid cookie string: must contain a name and value separated by "="');

      expect(() => {
        parseCookieString('; Path=/');
      }).toThrow('Invalid cookie string: must contain a name and value separated by "="');
    });

    it('should handle cookies with whitespace', () => {
      const cookieString = ' sessionId = abc123 ; Path = / ';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: ' abc123 ',
        path: ' / ',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with multiple semicolons', () => {
      const cookieString = 'sessionId=abc123;;;Path=/;;;Secure;;;';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        path: '/',
        secure: true,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
      });
    });

    it('should handle cookies with complex values', () => {
      const cookieString = 'complex=value%20with%20spaces%20and%20symbols%21%40%23%24%25; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'complex',
        value: 'value with spaces and symbols!@#$%',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with JSON-like values', () => {
      const cookieString = 'data=%7B%22id%22%3A123%2C%22name%22%3A%22John%22%7D; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'data',
        value: '{"id":123,"name":"John"}',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });
  });
});
