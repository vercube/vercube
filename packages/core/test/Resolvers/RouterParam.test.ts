import { describe, expect, it } from 'vitest';
import { resolveRouterParam } from '../../src/Resolvers/RouterParam';
import type { RouterTypes } from '../../src/Types/RouterTypes';

describe('RouterParam Resolver', () => {
  const createMockEvent = (params?: Record<string, string>): RouterTypes.RouterEvent => ({
    request: new Request('http://localhost/test'),
    response: new Response(),
    params,
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

  describe('resolveRouterParam', () => {
    it('should resolve a router parameter that exists', () => {
      const event = createMockEvent({
        id: '123',
        name: 'John',
        category: 'users',
      });

      const result = resolveRouterParam('id', event);

      expect(result).toBe('123');
    });

    it('should resolve a router parameter with string value', () => {
      const event = createMockEvent({
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
      });

      const result = resolveRouterParam('name', event);

      expect(result).toBe('John Doe');
    });

    it('should resolve a router parameter with numeric string value', () => {
      const event = createMockEvent({
        id: '456',
        count: '789',
        price: '99.99',
      });

      const result = resolveRouterParam('id', event);

      expect(result).toBe('456');
    });

    it('should resolve a router parameter with special characters', () => {
      const event = createMockEvent({
        slug: 'my-post-title',
        path: 'users/123/profile',
        query: 'search?term=test',
      });

      const result = resolveRouterParam('slug', event);

      expect(result).toBe('my-post-title');
    });

    it('should resolve a router parameter with unicode characters', () => {
      const event = createMockEvent({
        name: 'José María',
        title: '🎉 Welcome to our app! 🚀',
        description: 'Hello 世界 Привет',
      });

      const result = resolveRouterParam('name', event);

      expect(result).toBe('José María');
    });

    it('should return null for non-existent parameter', () => {
      const event = createMockEvent({
        id: '123',
        name: 'John',
      });

      const result = resolveRouterParam('nonexistent', event);

      expect(result).toBeNull();
    });

    it('should return null when params object is undefined', () => {
      const event = createMockEvent();

      const result = resolveRouterParam('id', event);

      expect(result).toBeNull();
    });

    it('should return null when params object is empty', () => {
      const event = createMockEvent({});

      const result = resolveRouterParam('id', event);

      expect(result).toBeNull();
    });

    it('should handle empty string parameter values', () => {
      const event = createMockEvent({
        id: '',
        name: 'John',
        description: '',
      });

      const result = resolveRouterParam('id', event);

      expect(result).toBe('');
    });

    it('should handle case-sensitive parameter names', () => {
      const event = createMockEvent({
        ID: '123',
        id: '456',
        Name: 'John',
        name: 'Jane',
      });

      const result1 = resolveRouterParam('ID', event);
      const result2 = resolveRouterParam('id', event);
      const result3 = resolveRouterParam('Name', event);
      const result4 = resolveRouterParam('name', event);

      expect(result1).toBe('123');
      expect(result2).toBe('456');
      expect(result3).toBe('John');
      expect(result4).toBe('Jane');
    });

    it('should handle parameter names with special characters', () => {
      const event = createMockEvent({
        'user-id': '123',
        post_title: 'My Post',
        'category.name': 'technology',
        'meta:type': 'article',
      });

      const result1 = resolveRouterParam('user-id', event);
      const result2 = resolveRouterParam('post_title', event);
      const result3 = resolveRouterParam('category.name', event);
      const result4 = resolveRouterParam('meta:type', event);

      expect(result1).toBe('123');
      expect(result2).toBe('My Post');
      expect(result3).toBe('technology');
      expect(result4).toBe('article');
    });

    it('should handle parameter names with spaces', () => {
      const event = createMockEvent({
        'user name': 'John Doe',
        'post title': 'My Blog Post',
        'category name': 'Technology',
      });

      const result1 = resolveRouterParam('user name', event);
      const result2 = resolveRouterParam('post title', event);
      const result3 = resolveRouterParam('category name', event);

      expect(result1).toBe('John Doe');
      expect(result2).toBe('My Blog Post');
      expect(result3).toBe('Technology');
    });

    it('should handle parameter names with numbers', () => {
      const event = createMockEvent({
        user1: 'John',
        user2: 'Jane',
        post2023: 'My Post',
        category1: 'Tech',
      });

      const result1 = resolveRouterParam('user1', event);
      const result2 = resolveRouterParam('user2', event);
      const result3 = resolveRouterParam('post2023', event);
      const result4 = resolveRouterParam('category1', event);

      expect(result1).toBe('John');
      expect(result2).toBe('Jane');
      expect(result3).toBe('My Post');
      expect(result4).toBe('Tech');
    });

    it('should handle many parameters', () => {
      const params: Record<string, string> = {};
      for (let i = 1; i <= 100; i++) {
        params[`param${i}`] = `value${i}`;
      }

      const event = createMockEvent(params);

      const result1 = resolveRouterParam('param1', event);
      const result50 = resolveRouterParam('param50', event);
      const result100 = resolveRouterParam('param100', event);

      expect(result1).toBe('value1');
      expect(result50).toBe('value50');
      expect(result100).toBe('value100');
    });

    it('should handle parameters with very long values', () => {
      const longValue = 'a'.repeat(10_000);
      const event = createMockEvent({
        content: longValue,
        description: 'Short description',
      });

      const result = resolveRouterParam('content', event);

      expect(result).toBe(longValue);
      expect(result).toHaveLength(10_000);
    });

    it('should handle parameters with JSON-like values', () => {
      const event = createMockEvent({
        config: '{"theme":"dark","notifications":true}',
        filters: '[{"field":"name","value":"John"},{"field":"age","value":"30"}]',
        metadata: '{"tags":["important","urgent"],"priority":"high"}',
      });

      const result1 = resolveRouterParam('config', event);
      const result2 = resolveRouterParam('filters', event);
      const result3 = resolveRouterParam('metadata', event);

      expect(result1).toBe('{"theme":"dark","notifications":true}');
      expect(result2).toBe('[{"field":"name","value":"John"},{"field":"age","value":"30"}]');
      expect(result3).toBe('{"tags":["important","urgent"],"priority":"high"}');
    });

    it('should handle parameters with URL-encoded values', () => {
      const event = createMockEvent({
        query: 'search%20term',
        path: 'users%2F123%2Fprofile',
        redirect: 'https%3A%2F%2Fexample.com%2Fpath%3Fparam%3Dvalue',
      });

      const result1 = resolveRouterParam('query', event);
      const result2 = resolveRouterParam('path', event);
      const result3 = resolveRouterParam('redirect', event);

      expect(result1).toBe('search%20term');
      expect(result2).toBe('users%2F123%2Fprofile');
      expect(result3).toBe('https%3A%2F%2Fexample.com%2Fpath%3Fparam%3Dvalue');
    });

    it('should handle parameters with emoji values', () => {
      const event = createMockEvent({
        reaction: '👍',
        status: '🎉',
        mood: '😀😎🤖',
      });

      const result1 = resolveRouterParam('reaction', event);
      const result2 = resolveRouterParam('status', event);
      const result3 = resolveRouterParam('mood', event);

      expect(result1).toBe('👍');
      expect(result2).toBe('🎉');
      expect(result3).toBe('😀😎🤖');
    });
  });
});
