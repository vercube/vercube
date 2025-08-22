import { describe, it, expect, vi } from 'vitest';
import {
  convertResponseToAWSResponse,
  convertBodyToAWSResponse,
} from '../../src/Adapters/aws-lambda/Utils/Response';

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

describe('[AWS Lambda] Response Utils', () => {
  describe('convertResponseToAWSResponse', () => {
    it('should convert Response headers to AWS format', () => {
      const headers = new MockHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Custom-Header': 'custom-value',
      });

      const response = new Response('{"message": "success"}', {
        status: 200,
        headers,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers).toEqual({
        'content-type': 'application/json',
        'cache-control': 'no-cache',
        'x-custom-header': 'custom-value',
      });
      expect(awsResponse.cookies).toBeUndefined();
      expect(awsResponse.multiValueHeaders).toBeUndefined();
    });

    it('should handle cookies for API Gateway compatibility', () => {
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
      expect(headers.getSetCookie()).toEqual([
        'sessionId=abc123; HttpOnly; Secure',
        'theme=dark; Path=/',
      ]);

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.cookies).toEqual([
        'sessionId=abc123; HttpOnly; Secure',
        'theme=dark; Path=/',
      ]);
      expect(awsResponse.multiValueHeaders).toEqual({
        'set-cookie': [
          'sessionId=abc123; HttpOnly; Secure',
          'theme=dark; Path=/',
        ],
      });
    });

    it('should handle array headers by joining with commas', () => {
      const headers = new MockHeaders();
      headers.set('Accept', 'application/json');
      headers.append('Accept', 'text/html');
      headers.append('Accept', 'text/plain');

      const response = new Response('content', {
        status: 200,
        headers,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers.accept).toBe(
        'application/json, text/html, text/plain',
      );
    });

    it('should handle null/undefined header values', () => {
      const headers = new MockHeaders({
        'Valid-Header': 'valid-value',
        'Null-Header': null as any,
        'Undefined-Header': undefined as any,
      });

      const response = new Response('content', {
        status: 200,
        headers,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers['valid-header']).toBe('valid-value');
      expect(awsResponse.headers['null-header']).toBe('null');
      expect(awsResponse.headers['undefined-header']).toBe('undefined');
    });

    it('should throw error for invalid response', () => {
      expect(() => {
        convertResponseToAWSResponse(null as any);
      }).toThrow(
        'Invalid response: response must be a valid Response object with headers',
      );

      expect(() => {
        convertResponseToAWSResponse(undefined as any);
      }).toThrow(
        'Invalid response: response must be a valid Response object with headers',
      );
    });

    it('should handle response without headers', () => {
      const response = new Response('content', { status: 200 });

      // Mock the headers property to be null
      Object.defineProperty(response, 'headers', {
        value: null,
        writable: true,
      });

      expect(() => {
        convertResponseToAWSResponse(response);
      }).toThrow(
        'Invalid response: response must be a valid Response object with headers',
      );
    });
  });

  describe('convertBodyToAWSResponse', () => {
    it('should convert text response to UTF-8 string', async () => {
      const response = new Response('Hello, World!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe('Hello, World!');
      expect(awsBody.isBase64Encoded).toBeUndefined();
    });

    it('should convert JSON response to UTF-8 string', async () => {
      const jsonData = { message: 'success', data: { id: 1, name: 'John' } };
      const response = new Response(JSON.stringify(jsonData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe(JSON.stringify(jsonData));
      expect(awsBody.isBase64Encoded).toBeUndefined();
    });

    it('should convert binary response to base64', async () => {
      const binaryData = Buffer.from('Hello, Binary World!');
      const response = new Response(binaryData, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe(binaryData.toString('base64'));
      expect(awsBody.isBase64Encoded).toBe(true);
    });

    it('should handle empty response body', async () => {
      const response = new Response(null, { status: 204 });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe('');
      expect(awsBody.isBase64Encoded).toBeUndefined();
    });

    it('should handle response without body', async () => {
      const response = new Response(undefined, { status: 204 });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe('');
      expect(awsBody.isBase64Encoded).toBeUndefined();
    });

    it('should identify text content types correctly', async () => {
      const textContentTypes = [
        'text/plain',
        'text/html',
        'text/css',
        'application/json',
        'application/javascript',
        'application/xml',
        'text/xml',
        'application/x-www-form-urlencoded',
      ];

      for (const contentType of textContentTypes) {
        const response = new Response('text content', {
          status: 200,
          headers: { 'Content-Type': contentType },
        });

        const awsBody = await convertBodyToAWSResponse(response);

        expect(awsBody.body).toBe('text content');
        expect(awsBody.isBase64Encoded).toBeUndefined();
      }
    });

    it('should identify binary content types correctly', async () => {
      const binaryContentTypes = [
        'application/octet-stream',
        'image/png',
        'image/jpeg',
        'application/pdf',
        'video/mp4',
        'audio/mpeg',
      ];

      const binaryData = Buffer.from('binary content');

      for (const contentType of binaryContentTypes) {
        const response = new Response(binaryData, {
          status: 200,
          headers: { 'Content-Type': contentType },
        });

        const awsBody = await convertBodyToAWSResponse(response);

        expect(awsBody.body).toBe(binaryData.toString('base64'));
        expect(awsBody.isBase64Encoded).toBe(true);
      }
    });

    it('should handle missing content-type header', async () => {
      const response = new Response('content', { status: 200 });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe('content');
      expect(awsBody.isBase64Encoded).toBeUndefined();
    });

    it('should throw error for invalid response', async () => {
      await expect(convertBodyToAWSResponse(null as any)).rejects.toThrow(
        'Invalid response: response must be a valid Response object',
      );

      await expect(convertBodyToAWSResponse(undefined as any)).rejects.toThrow(
        'Invalid response: response must be a valid Response object',
      );
    });

    it('should handle stream errors gracefully', async () => {
      // Create a response with a problematic body stream
      const response = new Response('content', { status: 200 });

      // Mock the body to throw an error
      const mockBody = {
        pipeTo: vi.fn().mockRejectedValue(new Error('Stream error')),
      };
      Object.defineProperty(response, 'body', {
        value: mockBody,
        writable: true,
      });

      await expect(convertBodyToAWSResponse(response)).rejects.toThrow(
        'Failed to convert response body: Stream error',
      );
    });

    it('should handle large response bodies', async () => {
      const largeContent = 'x'.repeat(10_000);
      const response = new Response(largeContent, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });

      const awsBody = await convertBodyToAWSResponse(response);

      expect(awsBody.body).toBe(largeContent);
      expect(awsBody.body.length).toBe(10_000);
    });

    // Tests to cover uncovered lines for 100% coverage

    it('should handle response without getSetCookie method (line 72)', () => {
      // Create a response with headers that don't have getSetCookie method
      const headers = new Headers({
        'Content-Type': 'application/json',
      });

      const response = new Response('{"message": "success"}', {
        status: 200,
        headers,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers).toEqual({
        'content-type': 'application/json',
      });
      expect(awsResponse.cookies).toBeUndefined();
      expect(awsResponse.multiValueHeaders).toBeUndefined();
    });

    it('should handle headers that do not have getSetCookie as a function (line 72)', () => {
      // Create mock headers where getSetCookie is not a function
      const mockHeaders = {
        forEach: function (callback: (value: string, key: string) => void) {
          callback('application/json', 'content-type');
        },
        getSetCookie: 'not-a-function', // This is not a function
      };

      const response = new Response('{"message": "success"}', {
        status: 200,
      });

      // Replace the headers with our mock
      Object.defineProperty(response, 'headers', {
        value: mockHeaders,
        writable: true,
        configurable: true,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers).toEqual({
        'content-type': 'application/json',
      });
      expect(awsResponse.cookies).toBeUndefined();
      expect(awsResponse.multiValueHeaders).toBeUndefined();
    });

    it('should handle explicit null and undefined header values (lines 63-66)', () => {
      // Create a mock Headers object with a custom forEach implementation
      const mockHeaders = {
        getSetCookie: () => [],
        forEach: function (callback: (value: string, key: string) => void) {
          // Simulate headers with null and undefined values
          callback('valid-value', 'valid-header');
          callback(null as any, 'null-header');
          callback(undefined as any, 'undefined-header');
        },
      };

      const response = new Response('content', {
        status: 200,
      });

      // Replace the headers with our mock
      Object.defineProperty(response, 'headers', {
        value: mockHeaders,
        writable: true,
        configurable: true,
      });

      const awsResponse = convertResponseToAWSResponse(response);

      expect(awsResponse.headers['valid-header']).toBe('valid-value');
      expect(awsResponse.headers['null-header']).toBe('null');
      expect(awsResponse.headers['undefined-header']).toBe('undefined');
    });

    it('should handle empty content type in isTextType (lines 154-155)', async () => {
      const response = new Response('content', {
        status: 200,
        headers: { 'Content-Type': '' }, // Empty content type
      });

      const awsBody = await convertBodyToAWSResponse(response);

      // Should treat empty content-type as binary and base64 encode
      expect(awsBody.body).toBe(Buffer.from('content').toString('base64'));
      expect(awsBody.isBase64Encoded).toBe(true);
    });

    it('should handle stream abort error (lines 189-190)', async () => {
      const response = new Response('content', { status: 200 });

      // Mock the body to simulate stream abort
      const mockBody = {
        pipeTo: vi.fn().mockImplementation((writableStream) => {
          // Simulate calling the abort method
          setTimeout(() => {
            writableStream.abort(new Error('Stream aborted'));
          }, 0);
          return Promise.reject(new Error('Stream aborted'));
        }),
      };

      Object.defineProperty(response, 'body', {
        value: mockBody,
        writable: true,
      });

      await expect(convertBodyToAWSResponse(response)).rejects.toThrow(
        'Stream aborted',
      );
    });

    it('should handle missing content-type header as falsy value', async () => {
      // Test with explicitly undefined content-type
      const response = new Response('content', {
        status: 200,
        headers: new Headers(), // No content-type header
      });

      // Mock headers.get to return undefined explicitly
      response.headers.get = vi.fn().mockReturnValue(undefined);

      const awsBody = await convertBodyToAWSResponse(response);

      // Should treat missing content-type as binary
      expect(awsBody.body).toBe(Buffer.from('content').toString('base64'));
      expect(awsBody.isBase64Encoded).toBe(true);
    });
  });
});
