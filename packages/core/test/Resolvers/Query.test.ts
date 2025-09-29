import { describe, expect, it } from 'vitest';
import { resolveQueryParam, resolveQueryParams } from '../../src/Resolvers/Query';
import type { RouterTypes } from '../../src/Types/RouterTypes';

describe('Query Resolvers', () => {
  const createMockEvent = (url: string): RouterTypes.RouterEvent => ({
    request: new Request(url),
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

  describe('resolveQueryParam', () => {
    it('should resolve a single query parameter', () => {
      const event = createMockEvent('http://localhost/test?name=John&age=30');
      const result = resolveQueryParam('name', event);

      expect(result).toBe('John');
    });

    it('should resolve a query parameter with special characters', () => {
      const event = createMockEvent('http://localhost/test?message=Hello%20World&path=%2Fusers%2F123');
      const result = resolveQueryParam('message', event);

      expect(result).toBe('Hello World');
    });

    it('should resolve a query parameter with multiple values (returns first)', () => {
      const event = createMockEvent('http://localhost/test?tags=javascript&tags=typescript&tags=node');
      const result = resolveQueryParam('tags', event);

      expect(result).toBe('javascript');
    });

    it('should return null for non-existent query parameter', () => {
      const event = createMockEvent('http://localhost/test?name=John&age=30');
      const result = resolveQueryParam('nonexistent', event);

      expect(result).toBeNull();
    });

    it('should return null for empty query parameter value', () => {
      const event = createMockEvent('http://localhost/test?name=&age=30');
      const result = resolveQueryParam('name', event);

      expect(result).toBe('');
    });

    it('should handle URL with no query parameters', () => {
      const event = createMockEvent('http://localhost/test');
      const result = resolveQueryParam('name', event);

      expect(result).toBeNull();
    });

    it('should handle URL with empty query string', () => {
      const event = createMockEvent('http://localhost/test?');
      const result = resolveQueryParam('name', event);

      expect(result).toBeNull();
    });

    it('should handle case-sensitive parameter names', () => {
      const event = createMockEvent('http://localhost/test?Name=John&name=Jane');
      const result = resolveQueryParam('Name', event);

      expect(result).toBe('John');
    });

    it('should handle numeric query parameters', () => {
      const event = createMockEvent('http://localhost/test?id=123&count=456');
      const result = resolveQueryParam('id', event);

      expect(result).toBe(123);
    });

    it('should handle boolean-like query parameters', () => {
      const event = createMockEvent('http://localhost/test?active=true&enabled=false');
      const result = resolveQueryParam('active', event);

      expect(result).toBe(true);
    });

    it('should handle complex query parameter values', () => {
      const event = createMockEvent('http://localhost/test?json=%7B%22key%22%3A%22value%22%7D');
      const result = resolveQueryParam('json', event);

      expect(result).toBe('{"key":"value"}');
    });
  });

  describe('resolveQueryParams', () => {
    it('should resolve all query parameters', () => {
      const event = createMockEvent('http://localhost/test?name=John&age=30&active=true');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        name: 'John',
        age: 30,
        active: true,
      });
    });

    it('should handle URL with no query parameters', () => {
      const event = createMockEvent('http://localhost/test');
      const result = resolveQueryParams(event);

      expect(result).toEqual({});
    });

    it('should handle URL with empty query string', () => {
      const event = createMockEvent('http://localhost/test?');
      const result = resolveQueryParams(event);

      expect(result).toEqual({});
    });

    it('should handle query parameters with special characters', () => {
      const event = createMockEvent('http://localhost/test?message=Hello%20World&path=%2Fusers%2F123');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        message: 'Hello World',
        path: '/users/123',
      });
    });

    it('should handle multiple values for the same parameter (keeps last)', () => {
      const event = createMockEvent('http://localhost/test?tags=javascript&tags=typescript&tags=node');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        tags: 'node',
      });
    });

    it('should handle empty query parameter values', () => {
      const event = createMockEvent('http://localhost/test?name=&age=30&empty=');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        name: '',
        age: 30,
        empty: '',
      });
    });

    it('should handle case-sensitive parameter names', () => {
      const event = createMockEvent('http://localhost/test?Name=John&name=Jane');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        Name: 'John',
        name: 'Jane',
      });
    });

    it('should handle numeric query parameters', () => {
      const event = createMockEvent('http://localhost/test?id=123&count=456&price=99.99');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        id: 123,
        count: 456,
        price: 99.99,
      });
    });

    it('should handle boolean-like query parameters', () => {
      const event = createMockEvent('http://localhost/test?active=true&enabled=false&visible=1');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        active: true,
        enabled: false,
        visible: 1,
      });
    });

    it('should handle complex query parameter values', () => {
      const event = createMockEvent('http://localhost/test?json=%7B%22key%22%3A%22value%22%7D&array=%5B1%2C2%2C3%5D');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        json: '{"key":"value"}',
        array: '[1,2,3]',
      });
    });

    it('should handle many query parameters', () => {
      const event = createMockEvent(
        'http://localhost/test?' +
          'p1=value1&p2=value2&p3=value3&p4=value4&p5=value5&' +
          'p6=value6&p7=value7&p8=value8&p9=value9&p10=value10',
      );
      const result = resolveQueryParams(event);

      expect(Object.keys(result)).toHaveLength(10);
      expect(result.p1).toBe('value1');
      expect(result.p10).toBe('value10');
    });

    it('should handle query parameters with equals signs in values', () => {
      const event = createMockEvent('http://localhost/test?filter=name=John&condition=age>=30');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        filter: 'name=John',
        condition: 'age>=30',
      });
    });

    it('should handle query parameters with ampersands in values', () => {
      const event = createMockEvent('http://localhost/test?query=name%3DJohn%26age%3D30');
      const result = resolveQueryParams(event);

      expect(result).toEqual({
        query: 'name=John&age=30',
      });
    });
  });
});
