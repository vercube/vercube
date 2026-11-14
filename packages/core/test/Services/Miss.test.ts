import { describe, expect, it, vi } from 'vitest';
import {
  BaseMiddleware,
  Controller,
  createApp,
  ErrorHandlerProvider,
  Get,
  GlobalMiddlewareRegistry,
  HttpServer,
  Post,
  Router,
} from '../../src';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';
import { withoutStack } from '../../src/Utils/Errors';
import type { App, ConfigTypes } from '../../src';

class HeaderMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('x-global', 'yes');
  }
}

@Controller('/miss')
class MissController {
  @Get('/thing')
  public get(): unknown {
    return { ok: true };
  }

  @Post('/thing')
  public post(): unknown {
    return { ok: true };
  }

  @Get('/item/:id')
  public item(): unknown {
    return { ok: true };
  }
}

/**
 * Creates an application serving {@link MissController} and no static files.
 *
 * @param {Partial<ConfigTypes.Config>} [cfg] - Configuration on top of the bare one
 * @returns {Promise<App>} The application
 */
async function createMissApp(cfg: Record<string, unknown> = {}): Promise<App> {
  return createApp({
    cfg: {
      requestLogging: false,
      requestContext: false,
      server: { static: { dirs: [] } },
      ...cfg,
    } as ConfigTypes.Config,
    setup: (app) => {
      app.container.bind(MissController);
    },
  });
}

describe('requests no route matches', () => {
  it('answers a 404 synchronously when nothing can observe the request', async () => {
    const app = await createMissApp();
    const server = app.container.get(HttpServer);

    // the first miss finds out that the default `public` directory does not exist
    await server.handleRequest(new Request('http://localhost/nope'));

    const response = server.handleRequest(new Request('http://localhost/nope'));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
    expect((response as Response).headers.get('content-type')).toBe('application/json');
    expect(await (response as Response).json()).toMatchObject({ status: 404, message: 'Route not found' });
  });

  it('answers a 405 synchronously, with the allowed methods', async () => {
    const app = await createMissApp();
    const server = app.container.get(HttpServer);

    // a method no file is served for, so no directory has to be looked at
    const response = server.handleRequest(new Request('http://localhost/miss/thing', { method: 'DELETE' })) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, POST');

    const dynamic = server.handleRequest(new Request('http://localhost/miss/item/1', { method: 'POST' })) as Response;

    expect(dynamic.status).toBe(405);
    expect(dynamic.headers.get('allow')).toBe('GET, HEAD');
  });

  it('runs the request context around a miss', async () => {
    const app = await createMissApp({ requestContext: true });
    const response = await app.fetch(new Request('http://localhost/nope'));

    expect(response.status).toBe(404);
  });

  it('still sends a miss through global middlewares', async () => {
    const app = await createMissApp();

    app.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(HeaderMiddleware);

    const notFound = await app.fetch(new Request('http://localhost/nope'));
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('x-global')).toBe('yes');

    const notAllowed = await app.fetch(new Request('http://localhost/miss/thing', { method: 'DELETE' }));
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.headers.get('allow')).toBe('GET, HEAD, POST');
    expect(notAllowed.headers.get('x-global')).toBe('yes');
  });

  it('hands the error to a custom error handler, which may answer asynchronously', async () => {
    const app = await createMissApp();
    const handleError = vi.fn(async (error: Error) => new Response(error.message, { status: 418 }));

    app.container.bindMock(ErrorHandlerProvider, { handleError });

    const notFound = await app.fetch(new Request('http://localhost/nope'));
    expect(notFound.status).toBe(418);
    expect(await notFound.text()).toBe('Route not found');

    const notAllowed = await app.fetch(new Request('http://localhost/miss/thing', { method: 'DELETE' }));
    expect(notAllowed.headers.get('allow')).toBe('GET, HEAD, POST');
    expect(handleError).toHaveBeenCalledTimes(2);
  });

  it('asks the static handler once while its directory is known to be missing', async () => {
    const app = await createMissApp();
    const handler = app.container.get(StaticRequestHandler);
    const handleRequest = vi.spyOn(handler, 'handleRequest');
    const request = (): Request => new Request('http://localhost/nope');

    expect(handler.handles(request())).toBe(true);
    expect(handler.handles(new Request('http://localhost/nope', { method: 'POST' }))).toBe(false);

    expect((await app.fetch(request())).status).toBe(404);
    expect(handleRequest).toHaveBeenCalledTimes(1);
    expect(handler.handles(request())).toBe(false);

    expect((await app.fetch(request())).status).toBe(404);
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });

  it('only asks the static handler under a mount prefix when several directories are served', async () => {
    const app = await createMissApp({ server: { static: { dirs: ['assets'] } } });
    const handler = app.container.get(StaticRequestHandler);
    const handles = (path: string): boolean => handler.handles(new Request(`http://localhost${path}`));

    expect(handles('/nope')).toBe(false);
    expect(handles('/assetsx')).toBe(false);
    expect(handles('/assets')).toBe(true);
    expect(handles('/assets/app.js')).toBe(true);
    expect(handles('/public/logo.png')).toBe(true);
    // left to the handler, which decodes and normalizes the path
    expect(handles('/%61ssets/app.js')).toBe(true);
    expect(handles('//assets/app.js')).toBe(true);

    // found missing, so not asked again for a moment
    expect((await app.fetch(new Request('http://localhost/assets/app.js'))).status).toBe(404);
    expect(handles('/assets/app.js')).toBe(false);
    expect(handles('/public/logo.png')).toBe(true);
  });

  it('looks at a missing directory again after a moment', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    try {
      const app = await createMissApp();
      const handler = app.container.get(StaticRequestHandler);

      await app.fetch(new Request('http://localhost/nope'));
      expect(handler.handles(new Request('http://localhost/nope'))).toBe(false);

      vi.advanceTimersByTime(1001);
      expect(handler.handles(new Request('http://localhost/nope'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collects the routed methods once per route table', async () => {
    const app = await createMissApp();
    const router = app.container.get(Router);

    expect(router.allowedMethods('/miss/thing')).toEqual(['GET', 'HEAD', 'POST']);
    expect(router.allowedMethods('/nope')).toEqual([]);

    router.addRoute({ method: 'DELETE', path: '/miss/thing', handler: router.match('GET', '/miss/thing')!.data });

    expect(router.allowedMethods('/miss/thing')).toEqual(['DELETE', 'GET', 'HEAD', 'POST']);
  });

  it('creates errors without a stack trace on request', () => {
    const limit = Error.stackTraceLimit;
    const error = withoutStack(() => new Error('quiet'));

    expect(error.stack?.includes('\n    at ')).toBe(false);
    expect(Error.stackTraceLimit).toBe(limit);
    expect(() =>
      withoutStack(() => {
        throw new Error('fails');
      }),
    ).toThrow('fails');
    expect(Error.stackTraceLimit).toBe(limit);
  });
});
