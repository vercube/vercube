import { BaseDecorator, createDecorator } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  BaseMiddleware,
  Body,
  Controller,
  createApp,
  Get,
  HttpServer,
  Middleware,
  Post,
  Redirect,
  Router,
  SetHeader,
  Status,
} from '../../src';
import { initializeMetadata, initializeMetadataMethod, setMetadataAction } from '../../src/Utils/Utils';
import type { App, MetadataTypes } from '../../src';

class NoopMiddleware extends BaseMiddleware {
  public override onRequest(): void {}
}

/** An action that depends on the request, as a decorator outside the framework may register. */
class EchoHeaderDecorator extends BaseDecorator<undefined, MetadataTypes.Metadata> {
  public override created(): void {
    initializeMetadata(this.prototype);

    setMetadataAction(initializeMetadataMethod(this.prototype, this.propertyName), {
      handler: (request: Request, response: Response) => {
        response.headers.set('x-echo', request.headers.get('x-in') ?? 'none');
      },
    });
  }
}

/**
 * Declares the same handlers twice: under `/simple`, where static actions are
 * folded, and under `/full`, where a middleware sends the request through the
 * whole pipeline and the actions run per request.
 *
 * @param {string} path - Where to mount the controller
 * @param {boolean} full - Whether to add the middleware
 * @returns {Function} The controller class
 */
function createController(path: string, full: boolean): Function {
  class ActionsController {
    @Get('/status')
    @Status(201)
    public status(): unknown {
      return { ok: true };
    }

    @Get('/header')
    @SetHeader('x-a', 'b')
    @SetHeader('cache-control', 'max-age=60')
    public header(): unknown {
      return { ok: true };
    }

    @Get('/content-type')
    @SetHeader('content-type', 'text/plain')
    public contentType(): unknown {
      return 'plain';
    }

    @Get('/redirect')
    @Redirect('/target')
    public redirect(): void {}

    @Get('/redirect-body')
    @Redirect('/target', 302)
    @SetHeader('x-a', 'b')
    public redirectBody(): unknown {
      return { moved: true };
    }

    @Get('/void')
    @SetHeader('x-a', 'b')
    public void(): void {}

    @Get('/void-status')
    @Status(202)
    public voidStatus(): void {}

    @Get('/async')
    @Status(201)
    public async async(): Promise<unknown> {
      return { ok: true };
    }

    @Get('/response')
    @SetHeader('x-a', 'b')
    @SetHeader('x-b', 'from-action')
    @Redirect('/target')
    public response(): Response {
      return new Response('own', { headers: { 'x-b': 'from-handler' } });
    }

    @Get('/throws')
    @SetHeader('x-a', 'b')
    @SetHeader('cache-control', 'max-age=60')
    @SetHeader('content-type', 'text/plain')
    public throws(): unknown {
      throw new BadRequestError('nope');
    }

    @Get('/rejects')
    @SetHeader('x-a', 'b')
    public async rejects(): Promise<unknown> {
      throw new BadRequestError('nope');
    }

    @Post('/body')
    @Status(201)
    @SetHeader('x-a', 'b')
    public body(@Body() body: unknown): unknown {
      return body;
    }
  }

  if (full) {
    Middleware(NoopMiddleware)(ActionsController);
  }

  Controller(path)(ActionsController);

  return ActionsController;
}

@Controller('/custom')
class CustomActionController {
  @Get('/echo')
  @(createDecorator(EchoHeaderDecorator, undefined) as MethodDecorator)
  @Status(201)
  public echo(): unknown {
    return { ok: true };
  }
}

/**
 * Creates the application.
 *
 * @returns {Promise<App>} The application
 */
async function createActionsApp(): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, requestContext: false },
    setup: (app) => {
      app.container.bind(createController('/simple', false) as never);
      app.container.bind(createController('/full', true) as never);
      app.container.bind(CustomActionController);
    },
  });
}

/**
 * Reduces a response to what a client sees of it.
 *
 * @param {Response} response - The response
 * @returns {Promise<unknown>} Its status, headers and body
 */
async function snapshot(response: Response): Promise<unknown> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers].toSorted(([a], [b]) => a.localeCompare(b)),
    body: await response.text(),
  };
}

const ROUTES: [method: string, path: string, body?: string][] = [
  ['GET', '/status'],
  ['GET', '/header'],
  ['GET', '/content-type'],
  ['GET', '/redirect'],
  ['GET', '/redirect-body'],
  ['GET', '/void'],
  ['GET', '/void-status'],
  ['GET', '/async'],
  ['GET', '/response'],
  ['GET', '/throws'],
  ['GET', '/rejects'],
  ['POST', '/body', '{"a":1}'],
  ['POST', '/body', '{not json'],
];

describe('static actions', () => {
  it('keeps a route with only static actions on the simple path', async () => {
    const app = await createActionsApp();
    const router = app.container.get(Router);

    for (const [method, path] of ROUTES) {
      const simple = router.match(method, `/simple${path}`)!.data;

      expect(simple.simple).toBe(true);
      expect(simple.staticResponse).toBeDefined();
      expect(router.match(method, `/full${path}`)!.data.simple).toBe(false);
    }

    expect(router.match('POST', '/simple/body')!.data.cloneBody).toBe(false);
  });

  it('answers synchronously', async () => {
    const app = await createActionsApp();
    const response = app.container.get(HttpServer).handleRequest(new Request('http://localhost/simple/status'));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(201);
  });

  it.each(ROUTES)('answers %s %s like the full pipeline does', async (method, path, body) => {
    const app = await createActionsApp();
    const request = (prefix: string): Request =>
      new Request(`http://localhost${prefix}${path}`, {
        method,
        body,
        headers: body ? { 'content-type': 'application/json' } : undefined,
      });

    const simple = await snapshot(await app.fetch(request('/simple')));
    const full = await snapshot(await app.fetch(request('/full')));

    expect(simple).toEqual(full);
  });

  it('sets the status and the headers', async () => {
    const app = await createActionsApp();

    const created = await app.fetch(
      new Request('http://localhost/simple/body', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('x-a')).toBe('b');
    expect(created.headers.get('content-type')).toBe('application/json');
    expect(await created.json()).toEqual({ a: 1 });

    const redirect = await app.fetch(new Request('http://localhost/simple/redirect'));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('location')).toBe('/target');
  });

  it('answers 204 without a content type for a handler that returns nothing', async () => {
    const app = await createActionsApp();

    const empty = await app.fetch(new Request('http://localhost/simple/void'));
    expect(empty.status).toBe(204);
    expect(empty.headers.get('x-a')).toBe('b');
    expect(empty.headers.has('content-type')).toBe(false);

    const accepted = await app.fetch(new Request('http://localhost/simple/void-status'));
    expect(accepted.status).toBe(202);
    expect(accepted.headers.has('content-type')).toBe(false);
  });

  it('merges the headers into a response the handler built, which wins', async () => {
    const app = await createActionsApp();
    const response = await app.fetch(new Request('http://localhost/simple/response'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-a')).toBe('b');
    expect(response.headers.get('x-b')).toBe('from-handler');
    // the handler did not redirect
    expect(response.headers.has('location')).toBe(false);
  });

  it('gives a handler error the headers, but not the ones describing the handler result', async () => {
    const app = await createActionsApp();

    for (const path of ['/simple/throws', '/simple/rejects']) {
      const response = await app.fetch(new Request(`http://localhost${path}`));

      expect(response.status).toBe(400);
      expect(response.headers.get('x-a')).toBe('b');
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.has('cache-control')).toBe(false);
    }
  });

  it('runs an action that depends on the request on every request', async () => {
    const app = await createActionsApp();
    const handler = app.container.get(Router).match('GET', '/custom/echo')!.data;

    expect(handler.simple).toBe(false);
    expect(handler.staticResponse).toBeUndefined();

    const first = await app.fetch(new Request('http://localhost/custom/echo', { headers: { 'x-in': 'one' } }));
    const second = await app.fetch(new Request('http://localhost/custom/echo', { headers: { 'x-in': 'two' } }));

    expect(first.status).toBe(201);
    expect(first.headers.get('x-echo')).toBe('one');
    expect(second.headers.get('x-echo')).toBe('two');
  });
});
