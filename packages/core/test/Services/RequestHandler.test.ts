// oxlint-disable no-unused-vars
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from '@vercube/di';
import { RequestHandler } from '../../src/Services/Router/RequestHandler';
import { MetadataResolver } from '../../src/Services/Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../../src/Services/Middleware/GlobalMiddlewareRegistry';
import { ErrorHandlerProvider } from '../../src/Services/ErrorHandler/ErrorHandlerProvider';
import { BaseMiddleware } from '../../src/Services/Middleware/BaseMiddleware';
import type { RouterTypes } from '../../src/Types/RouterTypes';
import type { MetadataTypes } from '../../src/Types/MetadataTypes';

// Mock middleware classes
class MockBeforeMiddleware extends BaseMiddleware {
  public async onRequest(request: Request, response: Response, args: any): Promise<Response | void> {
    return undefined;
  }
}

class MockAfterMiddleware extends BaseMiddleware {
  public async onResponse(request: Request, response: Response, handlerResponse: any): Promise<Response | void> {
    return undefined;
  }
}

class MockBeforeMiddlewareWithResponse extends BaseMiddleware {
  public async onRequest(request: Request, response: Response, args: any): Promise<Response | void> {
    return new Response('Early return', { status: 200 });
  }
}

class MockBeforeMiddlewareWithError extends BaseMiddleware {
  public async onRequest(request: Request, response: Response, args: any): Promise<Response | void> {
    throw new Error('Middleware error');
  }
}

class MockAfterMiddlewareWithError extends BaseMiddleware {
  public async onResponse(request: Request, response: Response, handlerResponse: any): Promise<Response | void> {
    throw new Error('After middleware error');
  }
}

// Mock controller
class MockController {
  public testMethod(arg1: string, arg2: number): string {
    return `Hello ${arg1} ${arg2}`;
  }

  public async asyncTestMethod(arg1: string): Promise<string> {
    return `Async Hello ${arg1}`;
  }

  public methodWithError(): never {
    throw new Error('Handler error');
  }
}

describe('RequestHandler', () => {
  let requestHandler: RequestHandler;
  let container: Container;
  let mockMetadataResolver: any;
  let mockGlobalMiddlewareRegistry: any;
  let mockErrorHandler: any;
  let mockInstance: MockController;

  beforeEach(() => {
    container = new Container();
    mockInstance = new MockController();

    // Create mocks
    mockMetadataResolver = {
      resolveMethod: vi.fn(),
      resolveMiddlewares: vi.fn(),
      resolveArgs: vi.fn(),
    };

    mockGlobalMiddlewareRegistry = {
      middlewares: [],
    };

    mockErrorHandler = {
      handleError: vi.fn(),
    };

    // Bind mocks
    container.bindMock(MetadataResolver, mockMetadataResolver);
    container.bindMock(GlobalMiddlewareRegistry, mockGlobalMiddlewareRegistry);
    container.bindMock(ErrorHandlerProvider, mockErrorHandler);
    container.bind(RequestHandler);

    requestHandler = container.get(RequestHandler);
    vi.clearAllMocks();
  });

  describe('prepareHandler', () => {
    it('should prepare handler with basic configuration', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [{ idx: 0, type: 'param', data: { name: 'id' } }],
        actions: [],
        meta: {},
      };

      const middlewares: MetadataTypes.Middleware[] = [
        {
          target: 'testMethod',
          middleware: MockBeforeMiddleware,
          priority: 1,
        },
      ];

      mockMetadataResolver.resolveMethod.mockReturnValue(method);
      mockMetadataResolver.resolveMiddlewares.mockReturnValue(middlewares);

      const result = requestHandler.prepareHandler({
        instance: mockInstance,
        propertyName: 'testMethod',
      });

      expect(result.instance).toBe(mockInstance);
      expect(result.propertyName).toBe('testMethod');
      expect(result.args).toEqual(method.args);
      expect(result.actions).toEqual(method.actions);
      expect(result.middlewares.beforeMiddlewares).toHaveLength(1);
      expect(result.middlewares.afterMiddlewares).toHaveLength(0);
    });

    it('should prepare handler with global middlewares', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const localMiddlewares: MetadataTypes.Middleware[] = [
        {
          target: 'testMethod',
          middleware: MockBeforeMiddleware,
          priority: 1,
        },
      ];

      const globalMiddlewares: MetadataTypes.Middleware[] = [
        {
          target: '__global__',
          middleware: MockAfterMiddleware,
          priority: 2,
        },
      ];

      mockMetadataResolver.resolveMethod.mockReturnValue(method);
      mockMetadataResolver.resolveMiddlewares.mockReturnValue(localMiddlewares);
      mockGlobalMiddlewareRegistry.middlewares = globalMiddlewares;

      const result = requestHandler.prepareHandler({
        instance: mockInstance,
        propertyName: 'testMethod',
      });

      expect(result.middlewares.beforeMiddlewares).toHaveLength(1);
      expect(result.middlewares.afterMiddlewares).toHaveLength(1);
    });

    it('should deduplicate middlewares', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const localMiddlewares: MetadataTypes.Middleware[] = [
        {
          target: 'testMethod',
          middleware: MockBeforeMiddleware,
          priority: 1,
        },
      ];

      const globalMiddlewares: MetadataTypes.Middleware[] = [
        {
          target: '__global__',
          middleware: MockBeforeMiddleware, // Same middleware
          priority: 2,
        },
      ];

      mockMetadataResolver.resolveMethod.mockReturnValue(method);
      mockMetadataResolver.resolveMiddlewares.mockReturnValue(localMiddlewares);
      mockGlobalMiddlewareRegistry.middlewares = globalMiddlewares;

      const result = requestHandler.prepareHandler({
        instance: mockInstance,
        propertyName: 'testMethod',
      });

      expect(result.middlewares.beforeMiddlewares).toHaveLength(1); // Should be deduplicated
    });

    it('should sort middlewares by priority', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const middlewares: MetadataTypes.Middleware[] = [
        {
          target: 'testMethod',
          middleware: MockBeforeMiddleware,
          priority: 10,
        },
        {
          target: 'testMethod',
          middleware: MockAfterMiddleware,
          priority: 1,
        },
      ];

      mockMetadataResolver.resolveMethod.mockReturnValue(method);
      mockMetadataResolver.resolveMiddlewares.mockReturnValue(middlewares);

      const result = requestHandler.prepareHandler({
        instance: mockInstance,
        propertyName: 'testMethod',
      });

      expect(result.middlewares.beforeMiddlewares[0].priority).toBe(10);
      expect(result.middlewares.afterMiddlewares[0].priority).toBe(1);
    });

    it('should handle middlewares without priority', () => {
      const method: MetadataTypes.Method = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const middlewares: MetadataTypes.Middleware[] = [
        {
          target: 'testMethod',
          middleware: MockBeforeMiddleware,
        },
      ];

      mockMetadataResolver.resolveMethod.mockReturnValue(method);
      mockMetadataResolver.resolveMiddlewares.mockReturnValue(middlewares);

      const result = requestHandler.prepareHandler({
        instance: mockInstance,
        propertyName: 'testMethod',
      });

      expect(result.middlewares.beforeMiddlewares).toHaveLength(1);
    });
  });

  describe('handleRequest', () => {
    let mockRequest: Request;
    let mockRoute: RouterTypes.RouteMatched<RouterTypes.RouterHandler>;

    beforeEach(() => {
      mockRequest = new Request('http://localhost/test');
      
      mockRoute = {
        data: {
          instance: mockInstance,
          propertyName: 'testMethod',
          args: [],
          actions: [],
          middlewares: {
            beforeMiddlewares: [],
            afterMiddlewares: [],
          },
        },
        params: {},
      };
    });

    it('should handle request with no middlewares and no args', async () => {
      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(200);
    });

    it('should handle request with resolved args', async () => {
      const resolvedArgs = [
        { idx: 0, type: 'param', resolved: 'world', data: { name: 'name' } },
        { idx: 1, type: 'param', resolved: 42, data: { name: 'id' } },
      ];

      mockMetadataResolver.resolveArgs.mockResolvedValue(resolvedArgs);

      mockRoute.data.args = [
        { idx: 0, type: 'param', data: { name: 'name' } },
        { idx: 1, type: 'param', data: { name: 'id' } },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(mockMetadataResolver.resolveArgs).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Response);
    });

    it('should handle request with before middleware', async () => {
      const mockMiddleware = new MockBeforeMiddleware();
      mockRoute.data.middlewares.beforeMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle request with before middleware that returns response', async () => {
      const mockMiddleware = new MockBeforeMiddlewareWithResponse();
      mockRoute.data.middlewares.beforeMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('Early return');
    });

    it('should handle before middleware error', async () => {
      const mockMiddleware = new MockBeforeMiddlewareWithError();
      const errorResponse = new Response('Error', { status: 500 });
      
      mockRoute.data.middlewares.beforeMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      mockErrorHandler.handleError.mockReturnValue(errorResponse);

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(mockErrorHandler.handleError).toHaveBeenCalled();
      expect(result).toBe(errorResponse);
    });

    it('should handle request with actions', async () => {
      const mockAction = {
        handler: vi.fn().mockReturnValue({ status: 201 }),
      };

      mockRoute.data.actions = [mockAction];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(mockAction.handler).toHaveBeenCalled();
      expect(result.status).toBe(201);
    });

    it('should handle async handler method', async () => {
      mockRoute.data.propertyName = 'asyncTestMethod';
      mockRoute.data.args = [{ idx: 0, type: 'param', data: { name: 'name' } }];

      const resolvedArgs = [
        { idx: 0, type: 'param', resolved: 'world', data: { name: 'name' } },
      ];

      mockMetadataResolver.resolveArgs.mockResolvedValue(resolvedArgs);

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('"Async Hello world"');
    });

    it('should handle handler method error', async () => {
      mockRoute.data.propertyName = 'methodWithError';
      const errorResponse = new Response('Error', { status: 500 });

      mockErrorHandler.handleError.mockReturnValue(errorResponse);

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(mockErrorHandler.handleError).toHaveBeenCalled();
      expect(result).toBe(errorResponse);
    });

    it('should handle request with after middleware', async () => {
      const mockMiddleware = new MockAfterMiddleware();
      mockRoute.data.middlewares.afterMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle after middleware error', async () => {
      const mockMiddleware = new MockAfterMiddlewareWithError();
      const errorResponse = new Response('Error', { status: 500 });
      
      mockRoute.data.middlewares.afterMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      mockErrorHandler.handleError.mockReturnValue(errorResponse);

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(mockErrorHandler.handleError).toHaveBeenCalled();
      expect(result).toBe(errorResponse);
    });

    it('should handle after middleware that returns response override', async () => {
      const mockMiddleware = {
        onResponse: vi.fn().mockResolvedValue({ status: 201, statusText: 'Created' }),
      };

      mockRoute.data.middlewares.afterMiddlewares = [
        {
          middleware: mockMiddleware,
          priority: 1,
          target: 'testMethod',
        },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result.status).toBe(201);
      expect(result.statusText).toBe('Created');
    });

    it('should handle request with custom content type', async () => {
      const customRequest = new Request('http://localhost/test', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await requestHandler.handleRequest(customRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle request with handler returning object', async () => {
      const mockInstanceWithObjectReturn = {
        testMethod: vi.fn().mockReturnValue({ message: 'Hello World' }),
      };

      mockRoute.data.instance = mockInstanceWithObjectReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('{"message":"Hello World"}');
    });

    it('should handle request with handler returning string', async () => {
      const mockInstanceWithStringReturn = {
        testMethod: vi.fn().mockReturnValue('Hello World'),
      };

      mockRoute.data.instance = mockInstanceWithStringReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('"Hello World"');
    });

    it('should handle request with handler returning null', async () => {
      const mockInstanceWithNullReturn = {
        testMethod: vi.fn().mockReturnValue(null),
      };

      mockRoute.data.instance = mockInstanceWithNullReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('null');
    });

    it('should handle request with handler returning undefined', async () => {
      const mockInstanceWithUndefinedReturn = {
        testMethod: vi.fn().mockReturnValue(undefined),
      };

      mockRoute.data.instance = mockInstanceWithUndefinedReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('');
    });

    it('should handle request with empty body response', async () => {
      const mockInstanceWithEmptyReturn = {
        testMethod: vi.fn().mockReturnValue(''),
      };

      mockRoute.data.instance = mockInstanceWithEmptyReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('""');
    });

    it('should handle request with complex response structure', async () => {
      const mockInstanceWithComplexReturn = {
        testMethod: vi.fn().mockReturnValue({
          data: { id: 1, name: 'Test' },
          meta: { timestamp: new Date().toISOString() },
        }),
      };

      mockRoute.data.instance = mockInstanceWithComplexReturn;

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      const responseData = await result.json();
      expect(responseData.data.id).toBe(1);
      expect(responseData.data.name).toBe('Test');
    });

    it('should handle request with custom response status and headers', async () => {
      const mockInstanceWithCustomResponse = {
        testMethod: vi.fn().mockReturnValue('Custom response'),
      };

      mockRoute.data.instance = mockInstanceWithCustomResponse;
      mockRoute.data.actions = [
        {
          handler: vi.fn().mockReturnValue({ 
            status: 201, 
            statusText: 'Created',
            headers: { 'X-Custom-Header': 'test' }
          }),
        },
      ];

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(201);
      expect(result.statusText).toBe('Created');
      expect(result.headers.get('X-Custom-Header')).toBe('test');
    });

    it('should handle request with default response values', async () => {
      const mockInstanceWithDefaultResponse = {
        testMethod: vi.fn().mockReturnValue('Default response'),
      };

      mockRoute.data.instance = mockInstanceWithDefaultResponse;
      mockRoute.data.actions = [];
      mockRoute.data.middlewares = {
        beforeMiddlewares: [],
        afterMiddlewares: [],
      };

      const result = await requestHandler.handleRequest(mockRequest, mockRoute);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(200);
      expect(await result.text()).toBe('"Default response"');
    });
  });

  describe('processOverrideResponse', () => {
    it('should handle FastResponse override', () => {
      const fastResponse = new Response('Fast Response', { status: 201 });
      const baseResponse = new Response('Base Response', { status: 200 });

      const result = (requestHandler as any).processOverrideResponse(fastResponse, baseResponse);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(201);
    });

    it('should handle ResponseInit override', () => {
      const responseInit = { status: 201, statusText: 'Created' };
      const baseResponse = new Response('Base Response', { status: 200 });

      const result = (requestHandler as any).processOverrideResponse(responseInit, baseResponse);

      expect(result.status).toBe(201);
      expect(result.statusText).toBe('Created');
    });

    it('should handle null response', () => {
      const baseResponse = new Response('Base Response', { status: 200 });

      const result = (requestHandler as any).processOverrideResponse(null, baseResponse);

      expect(result).toBe(baseResponse);
    });

    it('should handle undefined response', () => {
      const baseResponse = new Response('Base Response', { status: 200 });

      const result = (requestHandler as any).processOverrideResponse(undefined, baseResponse);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(200);
    });

    it('should create new response when no base provided', () => {
      const responseInit = { status: 201, statusText: 'Created' };

      const result = (requestHandler as any).processOverrideResponse(responseInit);

      expect(result.status).toBe(201);
      expect(result.statusText).toBe('Created');
    });

    it('should handle partial ResponseInit override', () => {
      const responseInit = { status: 201 };
      const baseResponse = new Response('Base Response', { 
        status: 200, 
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = (requestHandler as any).processOverrideResponse(responseInit, baseResponse);

      expect(result.status).toBe(201);
      expect(result.statusText).toBe('OK'); // Should preserve base statusText
    });
  });
});
