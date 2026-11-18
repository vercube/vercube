import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, Middleware, NotFoundError, Status, UnauthorizedError } from '../../src';

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
}));

vi.mock('@vercube/logger/toolkit', () => ({
  createMiddlewareLogger: () => ({ logger: {}, finish: mocks.finish, skipped: false }),
  extractSafeHeaders: () => ({}),
}));

class DenyMiddleware extends BaseMiddleware {
  public override onRequest(): void {
    throw new UnauthorizedError('Unauthorized');
  }
}

class ShortCircuitMiddleware extends BaseMiddleware {
  public override onRequest(): Response {
    return new Response('cached', { status: 203 });
  }
}

@Controller('/log')
class LoggedController {
  @Get('/ok')
  public ok(): { ok: boolean } {
    return { ok: true };
  }

  @Get('/async')
  public async later(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  @Get('/created')
  @Status(201)
  public created(): { ok: boolean } {
    return { ok: true };
  }

  @Get('/teapot')
  public teapot(): Response {
    return new Response('teapot', { status: 418 });
  }

  @Get('/missing')
  public missing(): never {
    throw new NotFoundError();
  }

  @Get('/broken')
  public async broken(): Promise<never> {
    throw new Error('broken');
  }

  @Get('/denied')
  @Middleware(DenyMiddleware)
  public denied(): { ok: boolean } {
    return { ok: true };
  }

  @Get('/short')
  @Middleware(ShortCircuitMiddleware)
  public short(): { ok: boolean } {
    return { ok: true };
  }
}

const boot = () => createApp({ cfg: { logLevel: 'silent' } as never, setup: (app) => app.container.bind(LoggedController) });

describe('status of the request wide event', () => {
  beforeEach(() => {
    mocks.finish.mockReset();
    mocks.finish.mockResolvedValue(undefined);
  });

  it.each([
    ['a handler that returns a value', 'GET', '/log/ok', 200],
    ['an asynchronous handler', 'GET', '/log/async', 200],
    ['a route with @Status', 'GET', '/log/created', 201],
    ['a handler that answers with its own response', 'GET', '/log/teapot', 418],
    ['a handler that throws an http error', 'GET', '/log/missing', 404],
    ['a handler that rejects', 'GET', '/log/broken', 500],
    ['a middleware that throws', 'GET', '/log/denied', 401],
    ['a middleware that ends the request', 'GET', '/log/short', 203],
    ['a path no route matches', 'GET', '/log/nowhere', 404],
    ['a method the path is not routed for', 'POST', '/log/ok', 405],
  ])('should be the one %s is answered with', async (_name, method, path, status) => {
    const app = await boot();

    const response = await app.fetch(new Request(`http://localhost${path}`, { method }));

    expect(response.status).toBe(status);
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith({ status });
  });
});
