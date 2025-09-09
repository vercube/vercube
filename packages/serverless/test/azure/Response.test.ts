import { describe, expect, it } from 'vitest';
import { convertResponseToAzureFunctionsResponse } from '../../src/Adapters/azure-functions/Utils/Response';

// Mock Headers.getAll method for testing
class MockHeaders extends Headers {
  private cookies: string[] = [];

  constructor(init?: HeadersInit) {
    super(init);
  }

  getSetCookie(): string[] {
    return this.cookies;
  }

  setCookie(cookie: string) {
    this.cookies.push(cookie);
  }
}

describe('[Azure Functions] Response Utils', () => {
  describe('convertResponseToAzureFunctionsResponse', () => {
    it('should convert Response to Azure Functions HttpResponseInit format', () => {
      const headers = new MockHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Custom-Header': 'custom-value',
      });

      const response = new Response('{"message": "success"}', {
        status: 200,
        headers,
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
        'cache-control': 'no-cache',
        'x-custom-header': 'custom-value',
      });
      expect(azureResponse.cookies).toBeUndefined();
      expect(azureResponse.body).toBeDefined();
    });

    it('should handle cookies for Azure Functions compatibility', () => {
      const headers = new MockHeaders({
        'Content-Type': 'application/json',
      });
      headers.setCookie('sessionId=abc123; HttpOnly; Secure');
      headers.setCookie('theme=dark; Path=/');

      const response = new Response('{"message": "success"}', {
        status: 200,
        headers,
      });

      // Replace the response.headers with our MockHeaders instance
      Object.defineProperty(response, 'headers', {
        value: headers,
        writable: true,
        configurable: true,
      });

      // Verify the mock is working
      expect(headers.getSetCookie()).toEqual(['sessionId=abc123; HttpOnly; Secure', 'theme=dark; Path=/']);

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.cookies).toHaveLength(2);
      expect(azureResponse.cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
      });
      expect(azureResponse.cookies![1]).toEqual({
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

    it('should handle response without cookies', () => {
      const headers = new MockHeaders({
        'Content-Type': 'application/json',
      });

      const response = new Response('{"message": "success"}', {
        status: 200,
        headers,
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.cookies).toBeUndefined();
      expect(azureResponse.body).toBeDefined();
    });

    it('should handle different HTTP status codes', () => {
      const statusCodes = [200, 201, 400, 401, 403, 404, 500, 502, 503];

      for (const status of statusCodes) {
        const response = new Response('response body', {
          status,
          headers: { 'Content-Type': 'text/plain' },
        });

        const azureResponse = convertResponseToAzureFunctionsResponse(response);

        expect(azureResponse.status).toBe(status);
        expect(azureResponse.headers).toEqual({
          'content-type': 'text/plain',
        });
      }
    });

    it('should handle response with empty body', () => {
      const response = new Response(null, { status: 204 });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(204);
      expect(azureResponse.body).toBeNull();
    });

    it('should handle response with undefined body', () => {
      const response = new Response(undefined, { status: 204 });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(204);
      expect(azureResponse.body).toBeNull();
    });

    it('should handle response with text body', () => {
      const response = new Response('Hello, World!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.body).toBeDefined();
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
      });
    });

    it('should handle response with JSON body', () => {
      const jsonData = { message: 'success', data: { id: 1, name: 'John' } };
      const response = new Response(JSON.stringify(jsonData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.body).toBeDefined();
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
      });
    });

    it('should handle response with binary body', () => {
      const binaryData = Buffer.from('Hello, Binary World!');
      const response = new Response(binaryData, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.body).toBeDefined();
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/octet-stream',
      });
    });

    it('should handle response with large body', () => {
      const largeContent = 'x'.repeat(10_000);
      const response = new Response(largeContent, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.body).toBeDefined();
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
      });
    });

    it('should handle response with custom headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'X-Custom-Header': 'custom-value',
          'X-API-Version': 'v1',
          'Cache-Control': 'max-age=3600',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
        'x-custom-header': 'custom-value',
        'x-api-version': 'v1',
        'cache-control': 'max-age=3600',
      });
    });

    it('should handle response with case-insensitive headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'content-type': 'text/plain',
          AUTHORIZATION: 'Bearer token',
          'X-Custom-Header': 'value',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
        authorization: 'Bearer token',
        'x-custom-header': 'value',
      });
    });

    it('should handle response with empty headers', () => {
      const response = new Response('content', { status: 200 });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain;charset=UTF-8',
      });
      expect(azureResponse.cookies).toBeUndefined();
    });

    it('should handle response with duplicate headers', () => {
      const headers = new MockHeaders();
      headers.set('Accept', 'application/json');
      headers.append('Accept', 'text/html');
      headers.append('Accept', 'text/plain');

      const response = new Response('content', {
        status: 200,
        headers,
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect((azureResponse.headers as Record<string, string>).accept).toBe('application/json, text/html, text/plain');
    });

    it('should handle response with null header values', () => {
      const headers = new MockHeaders({
        'Valid-Header': 'valid-value',
        'Null-Header': null as any,
        'Undefined-Header': undefined as any,
      });

      const response = new Response('content', {
        status: 200,
        headers,
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect((azureResponse.headers as Record<string, string>)['valid-header']).toBe('valid-value');
      expect((azureResponse.headers as Record<string, string>)['null-header']).toBe('null');
      expect((azureResponse.headers as Record<string, string>)['undefined-header']).toBe('undefined');
    });

    it('should handle response with special characters in headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Special-Header': 'value with spaces and symbols!@#$%',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect((azureResponse.headers as Record<string, string>)['content-type']).toBe('text/plain; charset=utf-8');
      expect((azureResponse.headers as Record<string, string>)['x-special-header']).toBe('value with spaces and symbols!@#$%');
    });

    it('should handle response with CORS headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE',
        'access-control-allow-headers': 'Content-Type, Authorization',
      });
    });

    it('should handle response with security headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/html',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      });
    });

    it('should handle response with cache headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'public, max-age=3600',
          ETag: '"abc123"',
          'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
        'cache-control': 'public, max-age=3600',
        etag: '"abc123"',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      });
    });

    it('should handle response with content encoding headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Encoding': 'gzip',
          'Content-Length': '123',
          'Transfer-Encoding': 'chunked',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
        'content-length': '123',
        'transfer-encoding': 'chunked',
      });
    });

    it('should handle response with authentication headers', () => {
      const response = new Response('content', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="api"',
          Authorization: 'Bearer token123',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
        'www-authenticate': 'Bearer realm="api"',
        authorization: 'Bearer token123',
      });
    });

    it('should handle response with rate limiting headers', () => {
      const response = new Response('content', {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '1000',
          'X-RateLimit-Remaining': '999',
          'X-RateLimit-Reset': '1640995200',
          'Retry-After': '60',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(429);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '999',
        'x-ratelimit-reset': '1640995200',
        'retry-after': '60',
      });
    });

    it('should handle response with custom status text', () => {
      const response = new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/plain' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(404);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
      });
    });

    it('should handle response with redirect status', () => {
      const response = new Response('', {
        status: 302,
        headers: {
          Location: 'https://example.com/new-location',
          'Content-Type': 'text/plain',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(302);
      expect(azureResponse.headers).toEqual({
        location: 'https://example.com/new-location',
        'content-type': 'text/plain',
      });
    });

    it('should handle response with server error status', () => {
      const response = new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(500);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
      });
    });

    it('should handle response with no content status', () => {
      const response = new Response(null, {
        status: 204,
        headers: { 'Content-Type': 'text/plain' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(204);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
      });
      expect(azureResponse.body).toBeNull();
    });

    it('should handle response with created status', () => {
      const response = new Response('{"id": 123}', {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/api/users/123',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(201);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
        location: '/api/users/123',
      });
    });

    it('should handle response with accepted status', () => {
      const response = new Response('{"status": "processing"}', {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(202);
      expect(azureResponse.headers).toEqual({
        'content-type': 'application/json',
      });
    });

    it('should handle response with partial content status', () => {
      const response = new Response('partial content', {
        status: 206,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Range': 'bytes 0-1023/2048',
        },
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(206);
      expect(azureResponse.headers).toEqual({
        'content-type': 'text/plain',
        'content-range': 'bytes 0-1023/2048',
      });
    });

    it('should handle response with multiple cookies with different attributes', () => {
      const headers = new MockHeaders();
      headers.setCookie('sessionId=abc123; HttpOnly; Secure; SameSite=Strict');
      headers.setCookie('theme=dark; Path=/; Max-Age=3600');
      headers.setCookie('language=en; Domain=.example.com; Expires=Wed, 09 Jun 2021 10:18:14 GMT');

      const response = new Response('content', {
        status: 200,
        headers,
      });

      // Replace the response.headers with our MockHeaders instance
      Object.defineProperty(response, 'headers', {
        value: headers,
        writable: true,
        configurable: true,
      });

      const azureResponse = convertResponseToAzureFunctionsResponse(response);

      expect(azureResponse.status).toBe(200);
      expect(azureResponse.cookies).toHaveLength(3);

      expect(azureResponse.cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });

      expect(azureResponse.cookies![1]).toEqual({
        name: 'theme',
        value: 'dark',
        path: '/',
        maxAge: 3600,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        sameSite: undefined,
        secure: false,
      });

      expect(azureResponse.cookies![2]).toEqual({
        name: 'language',
        value: 'en',
        domain: '.example.com',
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });
  });
});
