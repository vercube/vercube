import { Logger } from '@vercube/logger';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  BaseMiddleware,
  Body,
  Controller,
  createApp,
  Get,
  HttpServer,
  Middleware,
  Post,
  QueryParam,
  Router,
  UnauthorizedError,
  ValidationProvider,
} from '../../src';
import type { App, ValidationTypes } from '../../src';

const validated = vi.fn();

/** A Standard Schema that answers asynchronously, as a schema with an async refinement does. */
const asyncSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: async (value: unknown) => {
      validated(value);

      return value === 'bad' ? { issues: [{ message: 'bad value' }] } : { value: `parsed:${String(value)}` };
    },
  },
} as unknown as ValidationTypes.Schema;

class RejectingMiddleware extends BaseMiddleware {
  public override onRequest(): void {
    throw new UnauthorizedError('Unauthorized');
  }
}

class PassingMiddleware extends BaseMiddleware {
  public override onRequest(): void {}
}

@Controller('/args')
class ArgsController {
  @Get('/query')
  public query(@QueryParam({ name: 'age', validationSchema: z.coerce.number().int() }) age: number): unknown {
    return { age };
  }

  @Get('/async-query')
  public asyncQuery(@QueryParam({ name: 'q', validationSchema: asyncSchema }) q: string): unknown {
    return { q };
  }

  @Post('/body')
  public body(@Body({ validationSchema: z.object({ name: z.string() }) }) body: unknown): unknown {
    return body;
  }

  @Post('/guarded')
  @Middleware(RejectingMiddleware)
  public guarded(@Body({ validationSchema: asyncSchema }) body: unknown): unknown {
    return body;
  }

  @Post('/with-middleware')
  @Middleware(PassingMiddleware)
  public withMiddleware(@Body({ validationSchema: z.object({ name: z.string() }) }) body: unknown): unknown {
    return body;
  }
}

/**
 * Creates an application serving {@link ArgsController}.
 *
 * @returns {Promise<App>} The application
 */
async function createArgsApp(): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, requestContext: false },
    setup: (app) => {
      app.container.bind(ArgsController);
    },
  });
}

/**
 * Posts a JSON body to the application.
 *
 * @param {App} app - The application
 * @param {string} path - The request path
 * @param {unknown} body - The body
 * @returns {Promise<Response>} The response
 */
async function postJson(app: App, path: string, body: unknown): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('argument validation', () => {
  it('keeps a route whose only extra is a schema on the simple path', async () => {
    const app = await createArgsApp();
    const router = app.container.get(Router);

    for (const [method, path] of [
      ['GET', '/args/query'],
      ['POST', '/args/body'],
    ]) {
      const handler = router.match(method, path)!.data;

      expect(handler.simple).toBe(true);
      expect(handler.cloneBody).toBe(false);
      expect(handler.middlewares.beforeMiddlewares).toEqual([]);
    }
  });

  it('answers synchronously when the schema does', async () => {
    const app = await createArgsApp();
    const response = app.container.get(HttpServer).handleRequest(new Request('http://localhost/args/query?age=25'));

    expect(response).toBeInstanceOf(Response);
    expect(await (response as Response).json()).toEqual({ age: 25 });
  });

  it('rejects a synchronous argument that fails its schema', async () => {
    const app = await createArgsApp();
    const response = await app.fetch(new Request('http://localhost/args/query?age=abc'));

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Validation error - query-param');
  });

  it('awaits a schema that validates asynchronously', async () => {
    const app = await createArgsApp();

    const valid = await app.fetch(new Request('http://localhost/args/async-query?q=ok'));
    expect(await valid.json()).toEqual({ q: 'parsed:ok' });

    const invalid = await app.fetch(new Request('http://localhost/args/async-query?q=bad'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      message: 'Validation error - query-param',
      errors: [{ message: 'bad value' }],
    });
  });

  it('hands the parsed body to the handler and reports the issues of an invalid one', async () => {
    const app = await createArgsApp();

    const valid = await postJson(app, '/args/body', { name: 'John', isAdmin: true });
    expect(await valid.json()).toEqual({ name: 'John' });

    const invalid = await postJson(app, '/args/body', { name: 1 });
    const payload = await invalid.json();

    expect(invalid.status).toBe(400);
    expect(payload.message).toBe('Validation error - body');
    expect(payload.errors).toHaveLength(1);
  });

  it('validates on a route that has a middleware too', async () => {
    const app = await createArgsApp();

    const valid = await postJson(app, '/args/with-middleware', { name: 'John', isAdmin: true });
    expect(await valid.json()).toEqual({ name: 'John' });

    const invalid = await postJson(app, '/args/with-middleware', {});
    expect(invalid.status).toBe(400);
  });

  it('does not validate a request a before middleware rejected', async () => {
    const app = await createArgsApp();

    validated.mockClear();

    const response = await postJson(app, '/args/guarded', 'anything');

    expect(response.status).toBe(401);
    expect(validated).not.toHaveBeenCalled();
  });

  it('passes the value through, with a warning, when no validation provider is bound', async () => {
    const app = await createArgsApp();
    const warn = vi.fn();

    app.container.bindMock(ValidationProvider, null as never);
    app.container.bindMock(Logger, { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() });

    const response = await postJson(app, '/args/body', { name: 1 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 1 });
    expect(warn).toHaveBeenCalledWith('RequestHandler::ValidationProvider', 'Validation provider is not registered');
  });
});
