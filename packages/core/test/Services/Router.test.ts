import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HooksService } from '../../src/Services/Hooks/HooksService';
import { Router } from '../../src/Services/Router/Router';
import type { RouterTypes } from '../../src/Types/RouterTypes';

// Mock rou3
vi.mock('rou3', () => ({
  createRouter: vi.fn(() => ({})),
  addRoute: vi.fn(),
  findRoute: vi.fn(() => ({ path: '/test', method: 'GET', handler: {} })),
}));

describe('Router', () => {
  let router: Router;
  let container: Container;
  let mockHooksService: any;

  beforeEach(() => {
    container = new Container();

    mockHooksService = {
      trigger: vi.fn(),
    };

    container.bindMock(HooksService, mockHooksService);
    container.bind(Router);

    router = container.get(Router);
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize router and trigger hooks', () => {
      expect(() => {
        router.initialize();
      }).not.toThrow();

      expect(mockHooksService.trigger).toHaveBeenCalledTimes(2);
    });
  });

  describe('addRoute', () => {
    it('should add route when router is initialized', () => {
      router.initialize();

      const route: RouterTypes.Route = {
        method: 'GET',
        path: '/test',
        handler: {} as RouterTypes.RouterHandler,
      };

      expect(() => {
        router.addRoute(route);
      }).not.toThrow();
    });

    it('should reject a @Param that is not a parameter of the path', () => {
      router.initialize();

      const route = (path: string, ...names: string[]): RouterTypes.Route => ({
        method: 'GET',
        path,
        handler: {
          controller: 'UserController',
          propertyName: 'get',
          args: names.map((name, idx) => ({ idx, type: 'param', data: { name } })),
        } as unknown as RouterTypes.RouterHandler,
      });

      expect(() => router.addRoute(route('/p/:id', 'nope'))).toThrow(
        "@Param('nope') on UserController.get is not a parameter of the route path /p/:id",
      );
      expect(() => router.addRoute(route('/p/:id/c/:commentId', 'id', 'commentId'))).not.toThrow();
      expect(() => router.addRoute(route('/files/**:rest', 'rest'))).not.toThrow();
      expect(() => router.addRoute(route('/files/:name.:ext', 'name', 'ext'))).not.toThrow();
      // unnamed wildcards are exposed by position, `**` also as `_`
      expect(() => router.addRoute(route('/a/*/b/*', '0', '1'))).not.toThrow();
      expect(() => router.addRoute(route('/all/**', '_'))).not.toThrow();
      expect(() => router.addRoute(route('/named/**:rest', '_'))).toThrow(/not a parameter/);
    });

    it('should throw error when router is not initialized', () => {
      const route: RouterTypes.Route = {
        method: 'GET',
        path: '/test',
        handler: {} as RouterTypes.RouterHandler,
      };

      expect(() => {
        router.addRoute(route);
      }).toThrow('Router not initialized. Please call init() before adding routes.');
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      router.initialize();
    });

    it('should resolve route with valid URL', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: 'http://localhost:3000/api/users',
      };

      const result = router.resolve(routeFind);

      expect(result).toBeDefined();
    });

    it('should resolve route with relative path', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: '/api/users',
      };

      const result = router.resolve(routeFind);

      expect(result).toBeDefined();
    });

    it('should resolve route with invalid URL (should not throw)', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: 'invalid-url',
      };

      expect(() => {
        const result = router.resolve(routeFind);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('should resolve route with malformed URL', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: '://invalid',
      };

      expect(() => {
        const result = router.resolve(routeFind);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('should resolve route with empty path', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: '',
      };

      expect(() => {
        const result = router.resolve(routeFind);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('should resolve route with special characters in path', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'GET',
        path: 'http://localhost:3000/api/users/123?name=test&type=admin',
      };

      expect(() => {
        const result = router.resolve(routeFind);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('should resolve route with different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

      for (const method of methods) {
        const routeFind: RouterTypes.RouteFind = {
          method: method as any,
          path: '/api/test',
        };

        expect(() => {
          const result = router.resolve(routeFind);
          expect(result).toBeDefined();
        }).not.toThrow();
      }
    });

    it('should handle case-insensitive method conversion', () => {
      const routeFind: RouterTypes.RouteFind = {
        method: 'get',
        path: '/api/test',
      };

      expect(() => {
        const result = router.resolve(routeFind);
        expect(result).toBeDefined();
      }).not.toThrow();
    });
  });
});
