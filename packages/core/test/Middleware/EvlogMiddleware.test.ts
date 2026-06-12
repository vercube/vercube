import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvlogMiddleware, EVLOG_FINISH_KEY, EVLOG_REQUEST_LOGGER_KEY } from '../../src/Middleware/EvlogMiddleware';
import { RequestContext } from '../../src/Services/Router/RequestContext';
import { createTestApp } from '../Utils/App.mock';
import type { App } from '../../src/';

const mocks = vi.hoisted(() => ({
  createMiddlewareLogger: vi.fn(),
  extractSafeHeaders: vi.fn(() => ({})),
}));

vi.mock('@vercube/logger/toolkit', () => ({
  createMiddlewareLogger: mocks.createMiddlewareLogger,
  extractSafeHeaders: mocks.extractSafeHeaders,
}));

describe('EvlogMiddleware', () => {
  let app: App;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
    mocks.extractSafeHeaders.mockReturnValue({});
  });

  it('should do nothing on request when request context is not available', () => {
    app.container.bindMock(RequestContext, null as any);
    const middleware = app.container.resolve(EvlogMiddleware);

    const request = new Request('http://localhost/test');

    expect(() => middleware.onRequest(request, new Response(), {})).not.toThrow();
    expect(mocks.createMiddlewareLogger).not.toHaveBeenCalled();
  });

  it('should not store logger when the request is skipped', async () => {
    const logger = { info: vi.fn() };
    const finish = vi.fn();
    mocks.createMiddlewareLogger.mockReturnValue({ logger, finish, skipped: true });

    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      const request = new Request('http://localhost/test', { method: 'POST' });
      middleware.onRequest(request, new Response(), {});

      expect(mocks.createMiddlewareLogger).toHaveBeenCalledOnce();
      expect(requestContext.has(EVLOG_REQUEST_LOGGER_KEY)).toBe(false);
      expect(requestContext.has(EVLOG_FINISH_KEY)).toBe(false);
    });
  });

  it('should create and store a request-scoped logger and finish callback', async () => {
    const logger = { info: vi.fn() };
    const finish = vi.fn();
    mocks.createMiddlewareLogger.mockReturnValue({ logger, finish, skipped: false });

    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      const request = new Request('http://localhost/users?page=1', {
        method: 'POST',
        headers: { 'x-request-id': 'req-123' },
      });

      middleware.onRequest(request, new Response(), { middlewareArgs: { keep: 1 } as any });

      expect(mocks.createMiddlewareLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/users',
          requestId: 'req-123',
          keep: 1,
        }),
      );
      expect(requestContext.get(EVLOG_REQUEST_LOGGER_KEY)).toBe(logger);
      expect(requestContext.get(EVLOG_FINISH_KEY)).toBe(finish);
    });
  });

  it('should generate a request id when the header is missing', async () => {
    const finish = vi.fn();
    mocks.createMiddlewareLogger.mockReturnValue({ logger: {}, finish, skipped: false });

    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      const request = new Request('http://localhost/test');
      middleware.onRequest(request, new Response(), {});

      const args = mocks.createMiddlewareLogger.mock.calls[0][0];
      expect(args.requestId).toEqual(expect.any(String));
      expect(args.requestId.length).toBeGreaterThan(0);
    });
  });

  it('should do nothing on response when request context is not available', async () => {
    app.container.bindMock(RequestContext, null as any);
    const middleware = app.container.resolve(EvlogMiddleware);

    await expect(middleware.onResponse(new Request('http://localhost/test'), new Response())).resolves.toBeUndefined();
  });

  it('should call the finish callback with the response status', async () => {
    const finish = vi.fn().mockResolvedValue(undefined);

    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      requestContext.set(EVLOG_FINISH_KEY, finish);

      await middleware.onResponse(new Request('http://localhost/test'), new Response(null, { status: 201 }));

      expect(finish).toHaveBeenCalledWith({ status: 201 });
    });
  });

  it('should swallow errors thrown by the finish callback', async () => {
    const finish = vi.fn().mockRejectedValue(new Error('boom'));

    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      requestContext.set(EVLOG_FINISH_KEY, finish);

      await expect(middleware.onResponse(new Request('http://localhost/test'), new Response())).resolves.toBeUndefined();
      expect(finish).toHaveBeenCalledOnce();
    });
  });

  it('should do nothing on response when no finish callback was stored', async () => {
    const middleware = app.container.resolve(EvlogMiddleware);
    const requestContext = app.container.get(RequestContext);

    await requestContext.run(async () => {
      await expect(middleware.onResponse(new Request('http://localhost/test'), new Response())).resolves.toBeUndefined();
    });
  });
});
