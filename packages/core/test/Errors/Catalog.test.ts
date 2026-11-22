import { getErrorGuidance } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  BadRequestError,
  Body,
  Controller,
  CoreErrors,
  createApp,
  ErrorHandlerProvider,
  formatSseMessage,
  Get,
  HooksService,
  MethodNotAllowedError,
  NotFoundError,
  parseSetCookieHeader,
  PayloadTooLargeError,
  Post,
  RequestContext,
  serializeCookie,
  ShutdownRegistry,
  Throws,
  UnsupportedMediaTypeError,
} from '../../src';
import type { App } from '../../src';

@Controller('/catalog')
class CatalogController {
  @Get('/thing')
  public thing(): { ok: boolean } {
    return { ok: true };
  }

  @Post('/body')
  public body(@Body({ validationSchema: z.object({ name: z.string() }) }) body: { name: string }): { name: string } {
    return body;
  }
}

function create(cfg: Record<string, unknown> = {}): Promise<App> {
  return createApp({
    cfg: { dev: false, production: true, requestLogging: false, logLevel: 'error', ...cfg } as never,
    setup: (app) => {
      app.container.bind(CatalogController);
    },
  });
}

function post(body: string, type: string = 'application/json'): Request {
  return new Request('http://localhost/catalog/body', { method: 'POST', body, headers: { 'content-type': type } });
}

/** Runs what is expected to throw, and returns what it threw. */
function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }

  throw new TypeError('expected a throw'); // bare-error: a test helper
}

describe('core error catalog', () => {
  describe('errors of a request', () => {
    it('answers a path nobody routed as before, with the code added', async () => {
      const app = await create();
      const response = await app.fetch(new Request('http://localhost/nope'));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        status: 404,
        name: 'NotFoundError',
        message: 'Route not found',
        code: 'VERCUBE_CORE_ROUTE_NOT_FOUND',
      });
    });

    it('answers a method that is not routed as before, with the code added', async () => {
      const app = await create();
      const response = await app.fetch(new Request('http://localhost/catalog/thing', { method: 'DELETE' }));

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toContain('GET');
      expect(await response.json()).toEqual({
        status: 405,
        name: 'MethodNotAllowedError',
        message: 'Method not allowed',
        code: 'VERCUBE_CORE_METHOD_NOT_ALLOWED',
      });
    });

    it('keeps the class of the errors of a miss', () => {
      const notFound = CoreErrors.ROUTE_NOT_FOUND();
      const notAllowed = CoreErrors.METHOD_NOT_ALLOWED();

      expect(notFound).toBeInstanceOf(NotFoundError);
      expect(notFound).toMatchObject({ status: 404, name: 'NotFoundError', message: 'Route not found' });
      expect(notAllowed).toBeInstanceOf(MethodNotAllowedError);
      expect(notAllowed).toMatchObject({ status: 405, name: 'MethodNotAllowedError', message: 'Method not allowed' });
    });

    it('answers a body the schema rejects with its issues and the code', async () => {
      const app = await create();
      const response = await app.fetch(post(JSON.stringify({ name: 1 })));
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        status: 400,
        name: 'BadRequestError',
        message: 'Validation error - body',
        code: 'VERCUBE_CORE_VALIDATION_FAILED',
      });
      expect(body.errors).toHaveLength(1);
    });

    it('keeps the issues on the validation error', () => {
      const issues = [{ message: 'Required' }];
      const error = CoreErrors.VALIDATION_FAILED({ type: 'query-param', issues });

      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe('Validation error - query-param');
      expect(error.errors).toBe(issues);
    });

    it('answers a body that is not JSON', async () => {
      const app = await create();
      const response = await app.fetch(post('{nope'));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        status: 400,
        name: 'BadRequestError',
        message: 'Invalid JSON body',
        code: 'VERCUBE_CORE_JSON_BODY_INVALID',
      });
    });

    it('answers a body of a type @Body() does not read', async () => {
      const app = await create();
      const response = await app.fetch(post('abc', 'application/octet-stream'));

      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({
        name: 'UnsupportedMediaTypeError',
        message: 'Unsupported request body content type',
        code: 'VERCUBE_CORE_BODY_TYPE_UNSUPPORTED',
      });
      expect(CoreErrors.BODY_TYPE_UNSUPPORTED()).toBeInstanceOf(UnsupportedMediaTypeError);
    });

    it('answers a body over the limit', async () => {
      const app = await create({ server: { bodyLimit: 8 } });
      const response = await app.fetch(post(JSON.stringify({ name: 'much too long' })));

      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        name: 'PayloadTooLargeError',
        message: 'Request body is too large',
        code: 'VERCUBE_CORE_BODY_TOO_LARGE',
      });
      expect(CoreErrors.BODY_TOO_LARGE()).toBeInstanceOf(PayloadTooLargeError);
    });

    it('raises the errors of a request without a stack trace', async () => {
      const app = await create({ server: { bodyLimit: 64 } });
      const handle = vi.spyOn(app.container.get(ErrorHandlerProvider), 'handleError');

      await app.fetch(post(JSON.stringify({ name: 1 })));
      await app.fetch(post('{'));
      await app.fetch(post('abc', 'application/octet-stream'));
      await app.fetch(post(JSON.stringify({ name: 'x'.repeat(128) })));

      const errors = handle.mock.calls.map(([error]) => error);

      expect(errors.map((error) => getErrorGuidance(error)?.code)).toEqual([
        'VERCUBE_CORE_VALIDATION_FAILED',
        'VERCUBE_CORE_JSON_BODY_INVALID',
        'VERCUBE_CORE_BODY_TYPE_UNSUPPORTED',
        'VERCUBE_CORE_BODY_TOO_LARGE',
      ]);

      for (const error of [...errors, CoreErrors.ROUTE_NOT_FOUND(), CoreErrors.METHOD_NOT_ALLOWED()]) {
        expect(error.stack).toBe(`${error.name}: ${error.message}`);
      }

      // an error raised while the application is set up keeps its trace
      expect(CoreErrors.APP_ALREADY_INITIALIZED().stack).toContain('\n    at ');
    });
  });

  describe('errors of the application', () => {
    it('keeps a TypeError a TypeError', () => {
      const cookie = thrown(() => serializeCookie('bad name', 'x'));

      expect(cookie).toBeInstanceOf(TypeError);
      expect(cookie.name).toBe('TypeError');
      expect(cookie.message).toBe('Invalid cookie name: "bad name"');
      expect(getErrorGuidance(cookie)?.code).toBe('VERCUBE_CORE_COOKIE_NAME_INVALID');

      const sse = thrown(() => formatSseMessage({ data: 1, user: 2 } as never));

      expect(sse).toBeInstanceOf(TypeError);
      expect(sse.message).toBe('SSE message has unknown field "user". Wrap the payload in { data: ... }.');
      expect(getErrorGuidance(sse)?.code).toBe('VERCUBE_CORE_SSE_MESSAGE_UNKNOWN_FIELD');

      const throws = thrown(() => Throws(200 as never));

      expect(throws).toBeInstanceOf(TypeError);
      expect(throws.message).toBe('@Throws(): 200 is not an error status (400-599).');
      expect(getErrorGuidance(throws)?.code).toBe('VERCUBE_CORE_THROWS_STATUS_INVALID');
    });

    it('describes a plain error', () => {
      const cookie = thrown(() => parseSetCookieHeader('no-pair'));

      expect(cookie.constructor).toBe(Error);
      expect(cookie.message).toBe('Invalid cookie string: must contain a name and value separated by "="');
      expect(getErrorGuidance(cookie)).toMatchObject({
        code: 'VERCUBE_CORE_SET_COOKIE_MALFORMED',
        why: expect.any(String),
        fix: expect.any(String),
      });

      const hook = thrown(() => new HooksService().off({ __id: 1, __type: class {} } as never));

      expect(hook.message).toBe('Trying to unbind event that was not bound.');
      expect(getErrorGuidance(hook)?.code).toBe('VERCUBE_CORE_HOOK_NOT_BOUND');

      const context = thrown(() => new RequestContext().set('key', 1));

      expect(context.message).toBe(
        'RequestContext.set() called outside of request context. The context is automatically initialized by RequestHandler.',
      );
      expect(getErrorGuidance(context)?.code).toBe('VERCUBE_CORE_REQUEST_CONTEXT_MISSING');
    });

    it('keeps the failures of an AggregateError', async () => {
      const registry = new ShutdownRegistry();
      const failure = new TypeError('hook failed'); // bare-error: what a hook of the application throws

      registry.register(() => {
        throw failure;
      });

      const error = await registry.run().then(
        () => undefined,
        (error_: AggregateError) => error_,
      );

      expect(error).toBeInstanceOf(AggregateError);
      expect(error?.message).toBe('1 shutdown hook(s) failed');
      expect(error?.errors).toEqual([failure]);
      expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CORE_SHUTDOWN_HOOKS_FAILED');
    });

    it('fails a second listen with a code', async () => {
      const app = await create();

      (app as unknown as { fIsInitialized: boolean }).fIsInitialized = true;

      const error = await app.listen().then(
        () => undefined,
        (error_: Error) => error_,
      );

      expect(error?.message).toBe('App is already initialized');
      expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CORE_APP_ALREADY_INITIALIZED');
    });
  });

  describe('the body of an answered miss', () => {
    it('is the same for every request the shared error answers', async () => {
      const app = await create();
      const first = await app.fetch(new Request('http://localhost/nope'));
      const second = await app.fetch(new Request('http://localhost/other'));
      const notAllowed = await app.fetch(new Request('http://localhost/catalog/thing', { method: 'PUT' }));

      expect(await second.text()).toBe(await first.text());
      expect(await notAllowed.json()).toMatchObject({ status: 405, code: 'VERCUBE_CORE_METHOD_NOT_ALLOWED' });
    });

    it('is written from the error each time for an error of the application', async () => {
      const app = await create();
      const handler = app.container.get(ErrorHandlerProvider);
      const error = new NotFoundError('first');

      expect(await (await handler.handleError(error)).json()).toMatchObject({ message: 'first' });

      error.message = 'second';

      expect(await (await handler.handleError(error)).json()).toMatchObject({ message: 'second' });
    });
  });

  describe('the log of an answered miss', () => {
    it('writes no line of its own, at any level', async () => {
      const app = await create({ logLevel: 'debug' });
      const logger = app.container.get(Logger);
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

      const response = await app.fetch(new Request('http://localhost/nope'));

      expect(response.status).toBe(404);
      expect(debug).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });
});
