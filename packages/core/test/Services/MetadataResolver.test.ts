import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestBody } from '../../src/Resolvers/Body';
import { getRequestHeader, getRequestHeaders } from '../../src/Resolvers/Headers';
import { resolveQueryParam, resolveQueryParams } from '../../src/Resolvers/Query';
import { resolveRouterParam } from '../../src/Resolvers/RouterParam';
import { MetadataResolver } from '../../src/Services/Metadata/MetadataResolver';
import type { MetadataTypes } from '../../src/Types/MetadataTypes';
import type { RouterTypes } from '../../src/Types/RouterTypes';

// Mock the resolver functions
vi.mock('../../src/Resolvers/RouterParam', () => ({
  resolveRouterParam: vi.fn(),
}));

vi.mock('../../src/Resolvers/Body', () => ({
  resolveRequestBody: vi.fn(),
}));

vi.mock('../../src/Resolvers/Query', () => ({
  resolveQueryParam: vi.fn(),
  resolveQueryParams: vi.fn(),
}));

vi.mock('../../src/Resolvers/Headers', () => ({
  getRequestHeader: vi.fn(),
  getRequestHeaders: vi.fn(),
}));

describe('MetadataResolver', () => {
  let resolver: MetadataResolver;
  let mockEvent: RouterTypes.RouterEvent;

  beforeEach(() => {
    resolver = new MetadataResolver();

    mockEvent = {
      request: new Request('http://localhost/test'),
      response: new Response(),
      data: {} as any,
      params: { id: '123' },
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('resolveUrl', () => {
    it('should resolve URL with controller path and method path', () => {
      const instance = {
        __metadata: {
          __controller: { path: '/api' },
          __methods: {
            testMethod: { url: null },
          },
        },
      } as any;

      const params: MetadataTypes.ResolveUrlParams = {
        instance,
        propertyName: 'testMethod',
        path: '/users',
      };

      const result = resolver.resolveUrl(params);

      expect(result).toBe('/api/users');
      expect(instance.__metadata.__methods.testMethod.url).toBe('/api/users');
    });

    it('should resolve URL with empty controller path', () => {
      const instance = {
        __metadata: {
          __controller: { path: '' },
          __methods: {
            testMethod: { url: null },
          },
        },
      } as any;

      const params: MetadataTypes.ResolveUrlParams = {
        instance,
        propertyName: 'testMethod',
        path: '/users',
      };

      const result = resolver.resolveUrl(params);

      expect(result).toBe('/users');
    });

    it('should resolve URL with controller path ending with slash', () => {
      const instance = {
        __metadata: {
          __controller: { path: '/api/' },
          __methods: {
            testMethod: { url: null },
          },
        },
      } as any;

      const params: MetadataTypes.ResolveUrlParams = {
        instance,
        propertyName: 'testMethod',
        path: '/users',
      };

      const result = resolver.resolveUrl(params);

      expect(result).toBe('/api/users');
    });

    it('should resolve URL with method path starting with slash', () => {
      const instance = {
        __metadata: {
          __controller: { path: '/api' },
          __methods: {
            testMethod: { url: null },
          },
        },
      } as any;

      const params: MetadataTypes.ResolveUrlParams = {
        instance,
        propertyName: 'testMethod',
        path: '/users',
      };

      const result = resolver.resolveUrl(params);

      expect(result).toBe('/api/users');
    });

    it('should resolve URL with undefined controller path', () => {
      const instance = {
        __metadata: {
          __controller: { path: undefined },
          __methods: {
            testMethod: { url: null },
          },
        },
      } as any;

      const params: MetadataTypes.ResolveUrlParams = {
        instance,
        propertyName: 'testMethod',
        path: '/users',
      };

      const result = resolver.resolveUrl(params);

      expect(result).toBe('/users');
    });
  });

  describe('resolveMethod', () => {
    it('should resolve method from metadata', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: [],
          __methods: {
            testMethod: method,
          },
        },
      };

      const result = resolver.resolveMethod(ctx, 'testMethod');

      expect(result).toBe(method);
    });
  });

  describe('resolveArgs', () => {
    it('should resolve arguments in correct order', async () => {
      const args: MetadataTypes.Arg[] = [
        { idx: 2, type: 'param', data: { name: 'id' } },
        { idx: 1, type: 'body' },
        { idx: 0, type: 'query-param', data: { name: 'page' } },
      ];

      vi.mocked(resolveRouterParam).mockResolvedValue('123');
      vi.mocked(resolveRequestBody).mockResolvedValue({ data: 'test' });
      vi.mocked(resolveQueryParam).mockResolvedValue('1');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result).toHaveLength(3);
      expect(result[0].idx).toBe(0);
      expect(result[1].idx).toBe(1);
      expect(result[2].idx).toBe(2);
      expect(result[0].resolved).toBe('1');
      expect(result[1].resolved).toEqual({ data: 'test' });
      expect(result[2].resolved).toBe('123');
    });

    it('should handle empty arguments array', async () => {
      const args: MetadataTypes.Arg[] = [];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result).toEqual([]);
    });
  });

  describe('resolveArg', () => {
    it('should resolve param type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'param', data: { name: 'id' } }];

      vi.mocked(resolveRouterParam).mockResolvedValue('123');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('123');
      expect(resolveRouterParam).toHaveBeenCalledWith('id', mockEvent);
    });

    it('should resolve param type with empty name', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'param', data: {} }];

      vi.mocked(resolveRouterParam).mockResolvedValue('123');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('123');
      expect(resolveRouterParam).toHaveBeenCalledWith('', mockEvent);
    });

    it('should resolve body type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'body' }];

      vi.mocked(resolveRequestBody).mockResolvedValue({ data: 'test' });

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toEqual({ data: 'test' });
      expect(resolveRequestBody).toHaveBeenCalledWith(mockEvent);
    });

    it('should resolve multipart-form-data type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'multipart-form-data' }];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBeNull();
    });

    it('should resolve query-param type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'query-param', data: { name: 'page' } }];

      vi.mocked(resolveQueryParam).mockResolvedValue('1');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('1');
      expect(resolveQueryParam).toHaveBeenCalledWith('page', mockEvent);
    });

    it('should resolve query-param type with empty name', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'query-param', data: {} }];

      vi.mocked(resolveQueryParam).mockResolvedValue('1');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('1');
      expect(resolveQueryParam).toHaveBeenCalledWith('', mockEvent);
    });

    it('should resolve query-params type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'query-params' }];

      vi.mocked(resolveQueryParams).mockResolvedValue({
        page: '1',
        limit: '10',
      });

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toEqual({ page: '1', limit: '10' });
      expect(resolveQueryParams).toHaveBeenCalledWith(mockEvent);
    });

    it('should resolve header type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'header', data: { name: 'authorization' } }];

      vi.mocked(getRequestHeader).mockResolvedValue('Bearer token');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('Bearer token');
      expect(getRequestHeader).toHaveBeenCalledWith('authorization', mockEvent);
    });

    it('should resolve header type with empty name', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'header', data: {} }];

      vi.mocked(getRequestHeader).mockResolvedValue('Bearer token');

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('Bearer token');
      expect(getRequestHeader).toHaveBeenCalledWith('', mockEvent);
    });

    it('should resolve headers type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'headers' }];

      vi.mocked(getRequestHeaders).mockResolvedValue({
        'content-type': 'application/json',
      } as any);

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toEqual({
        'content-type': 'application/json',
      });
      expect(getRequestHeaders).toHaveBeenCalledWith(mockEvent);
    });

    it('should resolve request type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'request' }];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe(mockEvent.request);
    });

    it('should resolve response type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'response' }];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe(mockEvent.response);
    });

    it('should resolve custom type with resolver', async () => {
      const customResolver = vi.fn().mockResolvedValue('custom value');
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'custom', resolver: customResolver }];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBe('custom value');
      expect(customResolver).toHaveBeenCalledWith(mockEvent);
    });

    it('should resolve session type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'session' }];

      const result = await resolver.resolveArgs(args, mockEvent);

      expect(result[0].resolved).toBeNull();
    });

    it('should throw error for unknown argument type', async () => {
      const args: MetadataTypes.Arg[] = [{ idx: 0, type: 'unknown-type' as any }];

      await expect(resolver.resolveArgs(args, mockEvent)).rejects.toThrow('Unknown argument type: unknown-type');
    });
  });

  describe('resolveMiddlewares', () => {
    it('should resolve global and method-specific middlewares', () => {
      const globalMiddleware: MetadataTypes.Middleware = {
        target: '__global__',
        middleware: {} as any,
      };

      const methodMiddleware: MetadataTypes.Middleware = {
        target: 'testMethod',
        middleware: {} as any,
      };

      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: [methodMiddleware, globalMiddleware],
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(globalMiddleware); // Global should come first
      expect(result[1]).toBe(methodMiddleware);
    });

    it('should resolve only global middlewares', () => {
      const globalMiddleware: MetadataTypes.Middleware = {
        target: '__global__',
        middleware: {} as any,
      };

      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: [globalMiddleware],
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(globalMiddleware);
    });

    it('should resolve only method-specific middlewares', () => {
      const methodMiddleware: MetadataTypes.Middleware = {
        target: 'testMethod',
        middleware: {} as any,
      };

      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: [methodMiddleware],
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(methodMiddleware);
    });

    it('should return empty array when no middlewares match', () => {
      const otherMethodMiddleware: MetadataTypes.Middleware = {
        target: 'otherMethod',
        middleware: {} as any,
      };

      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: [otherMethodMiddleware],
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toEqual([]);
    });

    it('should handle undefined middlewares', () => {
      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: undefined as any,
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toEqual([]);
    });

    it('should handle null middlewares', () => {
      const ctx: MetadataTypes.Metadata = {
        __metadata: {
          __controller: { path: '' },
          __middlewares: null as any,
          __methods: {},
        },
      };

      const result = resolver.resolveMiddlewares(ctx, 'testMethod');

      expect(result).toEqual([]);
    });
  });
});
