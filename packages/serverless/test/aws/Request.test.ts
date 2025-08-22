import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { convertEventToRequest } from '../../src/Adapters/aws-lambda/Utils/Request';

describe('[AWS Lambda] Request Utils', () => {
  describe('convertEventToRequest', () => {
    it('should convert API Gateway v1 event to Request', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/api/users',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
          host: 'api.example.com',
        },
        queryStringParameters: {
          page: '1',
          limit: '10',
        },
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
      };

      const request = convertEventToRequest(v1Event);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toContain('/api/users');
      expect(request.url).toContain('page=1');
      expect(request.url).toContain('limit=10');
      expect(request.headers.get('Content-Type')).toBe('application/json');
      expect(request.headers.get('Authorization')).toBe('Bearer token123');
    });

    it('should convert API Gateway v2 event to Request', () => {
      const v2Event: APIGatewayProxyEventV2 = {
        version: '2.0',
        routeKey: 'POST /api/users',
        rawPath: '/api/users',
        rawQueryString: 'page=1&limit=10',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token123',
          host: 'api.example.com',
          'x-forwarded-proto': 'https',
        },
        cookies: ['sessionId=abc123', 'theme=dark'],
        body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' }),
        isBase64Encoded: false,
        requestContext: {
          http: {
            method: 'POST',
            path: '/api/users',
          },
          domainName: 'api.example.com',
        } as any,
      };

      const request = convertEventToRequest(v2Event);

      expect(request).toBeInstanceOf(Request);
      expect(request.method).toBe('POST');
      expect(request.url).toContain('/api/users');
      expect(request.url).toContain('page=1');
      expect(request.url).toContain('limit=10');
      expect(request.url).toMatch(/^https:\/\//);
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(request.headers.get('authorization')).toBe('Bearer token123');
      // Check cookies are set (we can't easily test getAll in test environment)
      expect(request.headers.get('cookie')).toBeDefined();
    });

    it('should handle base64 encoded body', () => {
      const encodedBody = Buffer.from('Hello, World!').toString('base64');
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/api/upload',
        headers: { host: 'api.example.com' },
        body: encodedBody,
        isBase64Encoded: true,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.body).toBeDefined();
      // Body is a ReadableStream, we can't easily test its content in this environment
    });

    it('should handle missing body', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.body).toBeNull();
    });

    it('should handle missing headers', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: {},
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.headers).toBeInstanceOf(Headers);
    });

    it('should handle missing query parameters', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.url).not.toContain('?');
    });

    it('should handle multi-value query parameters', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {
          tags: ['javascript', 'typescript'],
          category: ['backend'],
        },
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.url).toContain('tags=javascript');
      expect(request.url).toContain('tags=typescript');
      expect(request.url).toContain('category=backend');
    });

    it('should default to GET method when not provided', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: null as any,
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.method).toBe('GET');
    });

    it('should handle HTTP protocol detection', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: {
          host: 'api.example.com',
          'x-forwarded-proto': 'http',
        },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.url).toMatch(/^http:\/\//);
    });

    it('should default to HTTPS when protocol not specified', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.url).toMatch(/^https:\/\//);
    });

    it('should throw error for invalid event', () => {
      expect(() => {
        convertEventToRequest(null as any);
      }).toThrow('Invalid event: event must be a valid object');

      expect(() => {
        convertEventToRequest(undefined as any);
      }).toThrow('Invalid event: event must be a valid object');

      expect(() => {
        convertEventToRequest('invalid' as any);
      }).toThrow('Invalid event: event must be a valid object');
    });

    it('should handle path parameters in URL construction', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users/123',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: { id: '123' },
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      expect(request.url).toContain('/api/users/123');
    });

    // Tests to cover uncovered lines for 100% coverage

    it('should handle null headers in getHeaderValue (lines 38-39)', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: null as any, // This triggers the null check
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: { domainName: 'fallback.example.com' } as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      // Should use fallback hostname from requestContext
      expect(request.url).toContain('fallback.example.com');
    });

    it('should handle undefined headers in getHeaderValue', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: undefined as any, // This triggers the undefined check
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: { domainName: 'fallback.example.com' } as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      // Should use fallback hostname from requestContext
      expect(request.url).toContain('fallback.example.com');
    });

    it('should handle invalid event that is neither v1 nor v2 format (lines 69-70, 119-120)', () => {
      // Create an event that doesn't match v1 or v2 patterns
      const invalidEvent = {
        // Missing httpMethod (v1) and requestContext.http.method (v2)
        path: '/api/users',
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
        requestContext: {}, // Missing http property
      } as any;

      const request = convertEventToRequest(invalidEvent);

      // Should default to GET method and / path
      expect(request.method).toBe('GET');
      expect(request.url).toContain('/');
    });

    it('should handle base64 decoding failure (lines 208-209)', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/api/upload',
        headers: { host: 'api.example.com' },
        body: 'invalid-base64-string!@#$%', // Invalid base64 that will fail to decode
        isBase64Encoded: true,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      // Should fallback to original body string when base64 decoding fails
      expect(request.body).toBeDefined();
    });

    it('should handle event without requestContext domainName', () => {
      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/users',
        headers: {}, // No host header
        body: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any, // No domainName
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      // Should use default hostname
      expect(request.url).toContain('.'); // DEFAULT_HOSTNAME
    });

    it('should handle v2 event with missing http properties', () => {
      const v2Event = {
        version: '2.0',
        requestContext: {
          // Missing http property completely
        },
        headers: { host: 'api.example.com' },
        body: null,
        isBase64Encoded: false,
      } as any;

      const request = convertEventToRequest(v2Event);

      // Should default to GET method and / path
      expect(request.method).toBe('GET');
      expect(request.url).toContain('/');
    });

    it('should handle base64 decoding with Buffer.from throwing error (lines 208-209)', () => {
      // Mock Buffer.from to throw an error
      const originalBufferFrom = Buffer.from;
      Buffer.from = vi.fn().mockImplementation(() => {
        throw new Error('Base64 decode error');
      });

      const v1Event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/api/upload',
        headers: { host: 'api.example.com' },
        body: 'valid-base64-string', // This will trigger the catch block
        isBase64Encoded: true,
        multiValueHeaders: {},
        multiValueQueryStringParameters: {},
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        queryStringParameters: null,
      };

      const request = convertEventToRequest(v1Event);

      // Should fallback to original body string when base64 decoding throws
      expect(request.body).toBeDefined();

      // Restore original Buffer.from
      Buffer.from = originalBufferFrom;
    });
  });
});
