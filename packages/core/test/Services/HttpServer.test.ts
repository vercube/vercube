import { Container } from '@vercube/di';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HooksService, HttpServer, Router, type ConfigTypes } from '../../src';
import { RequestHandler } from '../../src/Services/Router/RequestHandler';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';
import { ErrorHandlerProvider } from '../../src/Services/ErrorHandler/ErrorHandlerProvider';
import * as srvx from 'srvx';

vi.mock('srvx', () => {
  const mockServe = vi.fn();
  const mockServer = {
    serve: vi.fn(),
    ready: vi.fn(),
  };

  return {
    serve: mockServe.mockReturnValue(mockServer),
  };
});

const config: ConfigTypes.Config = {
  server: {
    port: 3000,
    host: 'localhost',
  },
};

describe('HttpServer', () => {
  let httpServer: HttpServer;
  let container: Container;
  let mockRequestHandler: any;
  let mockStaticRequestHandler: any;
  let mockRouter: any;
  let mockErrorHandler: any;

  beforeEach(async () => {
    container = new Container();

    // Create mocks
    mockRequestHandler = {
      handleRequest: vi.fn(),
    };
    mockStaticRequestHandler = {
      handleRequest: vi.fn(),
    };
    mockRouter = {
      resolve: vi.fn(),
    };
    mockErrorHandler = {
      handleError: vi.fn(),
    };

    // Bind mocks
    container.bindMock(RequestHandler, mockRequestHandler);
    container.bindMock(StaticRequestHandler, mockStaticRequestHandler);
    container.bindMock(Router, mockRouter);
    container.bindMock(ErrorHandlerProvider, mockErrorHandler);

    container.bind(HttpServer);
    container.bind(HooksService);

    httpServer = container.get(HttpServer);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize the server with config', async () => {
      await httpServer.initialize(config);

      expect(vi.mocked(srvx.serve)).toHaveBeenCalledWith({
        bun: {
          error: expect.any(Function),
        },
        deno: {
          onError: expect.any(Function),
        },
        hostname: 'localhost',
        reusePort: true,
        port: 3000,
        fetch: expect.any(Function),
        plugins: [],
        manual: true,
      });
      expect((httpServer as any).fServer).toBeDefined();
    });

    it('should initialize the server with default config when server config is missing', async () => {
      const configWithoutServer = {} as ConfigTypes.Config;

      await httpServer.initialize(configWithoutServer);

      expect(vi.mocked(srvx.serve)).toHaveBeenCalledWith({
        bun: {
          error: expect.any(Function),
        },
        deno: {
          onError: expect.any(Function),
        },
        hostname: undefined,
        reusePort: true,
        port: undefined,
        fetch: expect.any(Function),
        plugins: [],
        manual: true,
      });
    });

    it('should handle bun error through error handler', async () => {
      await httpServer.initialize(config);

      const serveCall = vi.mocked(srvx.serve).mock.calls[0][0];
      const bunErrorHandler = serveCall.bun?.error;
      const testError = new Error('Bun error');

      mockErrorHandler.handleError.mockReturnValue(
        new Response('Error handled'),
      );

      const result = bunErrorHandler!(testError);

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(testError);
      expect(result).toBeInstanceOf(Response);
    });

    it('should handle deno error through error handler', async () => {
      await httpServer.initialize(config);

      const serveCall = vi.mocked(srvx.serve).mock.calls[0][0];
      const denoErrorHandler = serveCall.deno?.onError;
      const testError = new Error('Deno error');

      mockErrorHandler.handleError.mockReturnValue(
        new Response('Error handled'),
      );

      const result = denoErrorHandler!(testError);

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(testError);
      expect(result).toBeInstanceOf(Response);
    });
  });

  describe('addPlugin', () => {
    it('should add plugin to the server', () => {
      const mockPlugin = { name: 'test-plugin' } as any;

      httpServer.addPlugin(mockPlugin);

      expect((httpServer as any).fPlugins).toContain(mockPlugin);
    });

    it('should add multiple plugins', () => {
      const mockPlugin1 = { name: 'plugin1' } as any;
      const mockPlugin2 = { name: 'plugin2' } as any;

      httpServer.addPlugin(mockPlugin1);
      httpServer.addPlugin(mockPlugin2);

      expect((httpServer as any).fPlugins).toHaveLength(2);
      expect((httpServer as any).fPlugins).toContain(mockPlugin1);
      expect((httpServer as any).fPlugins).toContain(mockPlugin2);
    });
  });

  describe('listen', () => {
    it('should start listening on the server', async () => {
      await httpServer.initialize(config);
      await httpServer.listen();

      const mockServer = vi.mocked(srvx.serve).mock.results[0].value;
      expect(mockServer.serve).toHaveBeenCalled();
      expect(mockServer.ready).toHaveBeenCalled();
    });

    it('should handle serve error', async () => {
      await httpServer.initialize(config);

      const serveError = new Error('Serve error');
      const mockServer = vi.mocked(srvx.serve).mock.results[0].value;
      mockServer.serve.mockRejectedValue(serveError);

      await expect(httpServer.listen()).rejects.toThrow('Serve error');
    });

    it('should handle ready error', async () => {
      await httpServer.initialize(config);

      const readyError = new Error('Ready error');
      const mockServer = vi.mocked(srvx.serve).mock.results[0].value;
      mockServer.serve.mockResolvedValue(undefined);
      mockServer.ready.mockRejectedValue(readyError);

      await expect(httpServer.listen()).rejects.toThrow('Ready error');
    });
  });

  describe('handleRequest', () => {
    beforeEach(async () => {
      await httpServer.initialize(config);
    });

    it('should handle request with found route', async () => {
      const request = new Request('http://localhost/test');
      const mockRoute = { path: '/test', method: 'GET' };
      const expectedResponse = new Response('OK');

      mockRouter.resolve.mockReturnValue(mockRoute);
      mockRequestHandler.handleRequest.mockResolvedValue(expectedResponse);

      const result = await httpServer.handleRequest(request);

      expect(mockRouter.resolve).toHaveBeenCalledWith({
        path: request.url,
        method: request.method,
      });
      expect(mockRequestHandler.handleRequest).toHaveBeenCalledWith(
        request,
        mockRoute,
      );
      expect(result).toBe(expectedResponse);
    });

    it('should handle request with static file when route not found', async () => {
      const request = new Request('http://localhost/static/file.js');
      const staticResponse = new Response('static content');

      mockRouter.resolve.mockReturnValue(null);
      mockStaticRequestHandler.handleRequest.mockResolvedValue(staticResponse);

      const result = await httpServer.handleRequest(request);

      expect(mockRouter.resolve).toHaveBeenCalledWith({
        path: request.url,
        method: request.method,
      });
      expect(mockStaticRequestHandler.handleRequest).toHaveBeenCalledWith(
        request,
      );
      expect(result).toBe(staticResponse);
    });

    it('should throw NotFoundError when route not found and no static file', async () => {
      const request = new Request('http://localhost/not-found');
      const errorResponse = new Response('Not Found', { status: 404 });

      mockRouter.resolve.mockReturnValue(null);
      mockStaticRequestHandler.handleRequest.mockResolvedValue(null);
      mockErrorHandler.handleError.mockReturnValue(errorResponse);

      const result = await httpServer.handleRequest(request);

      expect(mockRouter.resolve).toHaveBeenCalledWith({
        path: request.url,
        method: request.method,
      });
      expect(mockStaticRequestHandler.handleRequest).toHaveBeenCalledWith(
        request,
      );
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route not found',
          status: 404,
          name: 'NotFoundError',
        }),
      );
      expect(result).toBe(errorResponse);
    });

    it('should handle static request handler error', async () => {
      const request = new Request('http://localhost/static/file.js');
      const staticError = new Error('Static handler error');
      const errorResponse = new Response('Internal Server Error', {
        status: 500,
      });

      mockRouter.resolve.mockReturnValue(null);
      mockStaticRequestHandler.handleRequest.mockRejectedValue(staticError);
      mockErrorHandler.handleError.mockReturnValue(errorResponse);

      const result = await httpServer.handleRequest(request);

      expect(mockRouter.resolve).toHaveBeenCalledWith({
        path: request.url,
        method: request.method,
      });
      expect(mockStaticRequestHandler.handleRequest).toHaveBeenCalledWith(
        request,
      );
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(staticError);
      expect(result).toBe(errorResponse);
    });
  });
});
