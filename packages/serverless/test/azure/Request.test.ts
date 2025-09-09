import { describe, expect, it } from 'vitest';
import { convertEventToRequest } from '../../src/Adapters/azure-functions/Utils/Request';

// Mock headers with forEach method
class MockHeaders {
  private headers: Record<string, string> = {};

  constructor(init?: Record<string, string>) {
    if (init) {
      this.headers = { ...init };
    }
  }

  forEach(callback: (value: string, key: string) => void) {
    for (const [key, value] of Object.entries(this.headers)) {
      callback(value, key);
    }
  }

  get(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
}

// Mock HttpRequest interface for testing
interface MockHttpRequest {
  method: string;
  url: string;
  headers: MockHeaders;
  body?: any;
  query: URLSearchParams;
  params: Record<string, string>;
}

describe('[Azure Functions] Request Utils', () => {
  describe('convertEventToRequest', () => {
    it('should convert Azure Functions HttpRequest to Request', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/users?page=1&limit=10',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
          host: 'api.example.com',
        }),
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
        query: new URLSearchParams({ page: '1', limit: '10' }),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/users?page=1&limit=10');
      expect(request.headers.get('Content-Type')).toBe('application/json');
      expect(request.headers.get('Authorization')).toBe('Bearer token123');
    });

    it('should handle GET request without body', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/users',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/users');
      expect(request.body).toBeNull();
    });

    it('should handle HEAD request without body', () => {
      const azureRequest = {
        method: 'HEAD',
        url: 'https://api.example.com/api/users',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('HEAD');
      expect(request.url).toBe('https://api.example.com/api/users');
      expect(request.body).toBeNull();
    });

    it('should handle request with body for non-GET/HEAD methods', () => {
      const azureRequest = {
        method: 'PUT',
        url: 'https://api.example.com/api/users/123',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' }),
        query: new URLSearchParams(),
        params: { id: '123' },
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('PUT');
      expect(request.url).toBe('https://api.example.com/api/users/123');
      expect(request.body).toBeDefined();
    });

    it('should handle request with ReadableStream body', () => {
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream data'));
          controller.close();
        },
      });

      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/upload',
        headers: new MockHeaders({
          'Content-Type': 'application/octet-stream',
          host: 'api.example.com',
        }),
        body: bodyStream,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/upload');
      expect(request.body).toBe(bodyStream);
    });

    it('should handle request with empty headers', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/users',
        headers: new MockHeaders({}),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/users');
      expect(request.headers).toBeInstanceOf(Headers);
    });

    it('should handle request with query parameters', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/users?page=1&limit=10&sort=name',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams({ page: '1', limit: '10', sort: 'name' }),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/users?page=1&limit=10&sort=name');
    });

    it('should handle request with path parameters', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/users/123',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: { id: '123' },
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/users/123');
    });

    it('should handle request with special characters in URL', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/search?q=hello%20world&category=tech%2Bnews',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams({ q: 'hello world', category: 'tech+news' }),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/search?q=hello%20world&category=tech%2Bnews');
    });

    it('should handle request with different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

      for (const method of methods) {
        const azureRequest = {
          method: method as any,
          url: 'https://api.example.com/api/test',
          headers: new MockHeaders({
            host: 'api.example.com',
          }),
          body: method === 'GET' || method === 'HEAD' ? undefined : 'test body',
          query: new URLSearchParams(),
          params: {},
        };

        const request = convertEventToRequest(azureRequest as any);

        expect(request.method).toBe(method);
        expect(request.url).toBe('https://api.example.com/api/test');
      }
    });

    it('should handle request with binary data', () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(binaryData);
          controller.close();
        },
      });

      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/upload',
        headers: new MockHeaders({
          'Content-Type': 'application/octet-stream',
          'Content-Length': '5',
          host: 'api.example.com',
        }),
        body: bodyStream,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/upload');
      expect(request.body).toBe(bodyStream);
      expect(request.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(request.headers.get('Content-Length')).toBe('5');
    });

    it('should handle request with custom headers', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/webhook',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
          'X-API-Key': 'secret-key',
          'User-Agent': 'Azure-Functions/1.0',
          host: 'api.example.com',
        }),
        body: JSON.stringify({ event: 'test' }),
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/webhook');
      expect(request.headers.get('Content-Type')).toBe('application/json');
      expect(request.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(request.headers.get('X-API-Key')).toBe('secret-key');
      expect(request.headers.get('User-Agent')).toBe('Azure-Functions/1.0');
    });

    it('should handle request with case-insensitive headers', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/test',
        headers: new MockHeaders({
          'content-type': 'application/json',
          AUTHORIZATION: 'Bearer token',
          'X-Custom-Header': 'value',
          host: 'api.example.com',
        }),
        body: JSON.stringify({ test: true }),
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(request.headers.get('AUTHORIZATION')).toBe('Bearer token');
      expect(request.headers.get('X-Custom-Header')).toBe('value');
    });

    it('should handle request with empty body for POST', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/empty',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: '',
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/empty');
      expect(request.body).toBeDefined();
    });

    it('should handle request with null body', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/null',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: null as any,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/null');
      expect(request.body).toBeNull();
    });

    it('should handle request with undefined body', () => {
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/undefined',
        headers: new MockHeaders({
          'Content-Type': 'application/json',
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/undefined');
      expect(request.body).toBeNull();
    });

    it('should handle request with large body', () => {
      const largeBody = 'x'.repeat(10_000);
      const azureRequest = {
        method: 'POST',
        url: 'https://api.example.com/api/large',
        headers: new MockHeaders({
          'Content-Type': 'text/plain',
          'Content-Length': '10000',
          host: 'api.example.com',
        }),
        body: largeBody,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/api/large');
      expect(request.body).toBeDefined();
      expect(request.headers.get('Content-Length')).toBe('10000');
    });

    it('should handle request with complex query parameters', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/search?q=hello+world&tags=javascript&tags=typescript&page=1&limit=10',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams([
          ['q', 'hello world'],
          ['tags', 'javascript'],
          ['tags', 'typescript'],
          ['page', '1'],
          ['limit', '10'],
        ]),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe(
        'https://api.example.com/api/search?q=hello+world&tags=javascript&tags=typescript&page=1&limit=10',
      );
    });

    it('should handle request with special characters in path', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/users/user%2Bname%40domain.com',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: { username: 'user+name@domain.com' },
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/users/user%2Bname%40domain.com');
    });

    it('should handle request with different protocols', () => {
      const protocols = ['http', 'https'];

      for (const protocol of protocols) {
        const azureRequest = {
          method: 'GET',
          url: `${protocol}://api.example.com/api/test`,
          headers: new MockHeaders({
            host: 'api.example.com',
          }),
          body: undefined,
          query: new URLSearchParams(),
          params: {},
        };

        const request = convertEventToRequest(azureRequest as any);

        expect(request).toBeInstanceOf(Request);
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${protocol}://api.example.com/api/test`);
      }
    });

    it('should handle request with port in URL', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com:8080/api/test',
        headers: new MockHeaders({
          host: 'api.example.com:8080',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com:8080/api/test');
    });

    it('should handle request with fragment in URL', () => {
      const azureRequest = {
        method: 'GET',
        url: 'https://api.example.com/api/test#section1',
        headers: new MockHeaders({
          host: 'api.example.com',
        }),
        body: undefined,
        query: new URLSearchParams(),
        params: {},
      };

      const request = convertEventToRequest(azureRequest as any);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/api/test#section1');
    });
  });
});
