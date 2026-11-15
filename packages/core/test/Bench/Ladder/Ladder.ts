/**
 * The benchmark ladder: one application whose routes each isolate one cost of
 * the request path, so a change that makes a single rung fall is visible even
 * when `plain` does not move.
 *
 * Shared by the socket runner (`Run.ts`, real servers under bombardier) and by
 * the in-process bench (`../Ladder.bench.ts`). It is loaded directly by Node,
 * Bun and Deno, so it sticks to erasable TypeScript: decorators are applied by
 * hand through {@link route}.
 */

type Core = typeof import('@vercube/core');

/** Subset of zod the ladder needs, so the module does not import it itself. */
interface SchemaBuilder {
  object: (shape: Record<string, unknown>) => unknown;
  string: () => unknown;
  number: () => unknown;
  coerce: { number: () => unknown };
}

/** Which configuration the application runs with. */
export type LadderVariant = 'bare' | 'default';

export interface LadderOptions {
  /** `bare` is what `vercube/benchmarks` runs, `default` is what `createApp` gives a new project. */
  variant: LadderVariant;
  runtime?: 'node' | 'bun' | 'deno';
  port?: number;
}

export interface Rung {
  /** Stable identifier, used on the command line and in result files. */
  id: string;
  /** Human readable name, used in tables. */
  title: string;
  variant: LadderVariant;
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** Expected response status. */
  status: number;
}

const JSON_BODY = JSON.stringify({ name: 'ladder', age: 30 });
const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Builds a rung with the defaults most of them share.
 *
 * @param {string} id - Stable identifier
 * @param {string} title - Human readable name
 * @param {string} path - Request path
 * @param {Partial<Rung>} [overrides] - Anything that differs from a plain `GET` answering 200
 * @returns {Rung} The rung
 */
function rung(id: string, title: string, path: string, overrides: Partial<Rung> = {}): Rung {
  return { id, title, path, variant: 'bare', method: 'GET', status: 200, ...overrides };
}

/**
 * Builds a rung that posts the JSON body.
 *
 * @param {string} id - Stable identifier
 * @param {string} title - Human readable name
 * @param {string} path - Request path
 * @param {Partial<Rung>} [overrides] - Anything that differs from a `POST` answering 200
 * @returns {Rung} The rung
 */
function post(id: string, title: string, path: string, overrides: Partial<Rung> = {}): Rung {
  return rung(id, title, path, { method: 'POST', headers: JSON_HEADERS, body: JSON_BODY, ...overrides });
}

export const RUNGS: readonly Rung[] = [
  rung('plain', 'plain', '/plain'),
  rung('async', 'async handler', '/async'),
  rung('param-query', 'param + query', '/id/42?name=ladder'),
  rung('header', '@Header', '/header', { headers: { 'x-ladder': '1' } }),
  rung('query-schema', '@QueryParam + schema', '/query-schema?age=25'),
  rung('list', '50 object JSON payload', '/list'),
  rung('status', '@Status', '/status', { status: 201 }),
  rung('set-header', '@SetHeader', '/set-header'),
  rung('redirect', '@Redirect', '/redirect', { status: 301 }),
  rung('mw1', '1 middleware', '/mw1'),
  rung('mw3', '3 middlewares', '/mw3'),
  rung('mw-both', 'onRequest + onResponse', '/mw-both'),
  rung('auth', 'auth middleware', '/auth', { headers: { authorization: 'Bearer ladder' } }),
  post('body', '@Body', '/json'),
  post('body-schema', '@Body + schema', '/json-schema'),
  post('body-mw', '@Body + middleware', '/json-mw'),
  post('body-after', '@Body + onResponse middleware', '/json-after'),
  post('body-status', '@Body + @Status', '/json-status', { status: 201 }),
  post('body-full', '@Body + schema + auth + @Status', '/json-full', {
    status: 201,
    headers: { ...JSON_HEADERS, authorization: 'Bearer ladder' },
  }),
  rung('404', '404', '/nope', { status: 404 }),
  rung('405', '405', '/plain', { method: 'POST', status: 405 }),
  rung('default-plain', 'plain, default config', '/plain', { variant: 'default' }),
  post('default-body', '@Body, default config', '/json', { variant: 'default' }),
  rung('default-404', '404, default config', '/nope', { variant: 'default', status: 404 }),
];

/**
 * Declares a route on a controller class without decorator syntax.
 *
 * @param {Function} controller - The controller class
 * @param {string} name - Method name
 * @param {Function[]} decorators - Method decorators, in the order they would be written
 * @param {Function[]} params - One parameter decorator per handler parameter
 * @param {Function} handler - The route handler
 * @returns {void}
 */
function route(controller: Function, name: string, decorators: Function[], params: Function[], handler: Function): void {
  Object.defineProperty(controller.prototype, name, { value: handler, writable: true, configurable: true });

  for (const [index, decorator] of params.entries()) {
    decorator(controller.prototype, name, index);
  }

  // decorators apply bottom-up
  for (const decorator of decorators.toReversed()) {
    decorator(controller.prototype, name, Object.getOwnPropertyDescriptor(controller.prototype, name));
  }
}

/**
 * Creates the ladder application. Nothing listens until `app.listen()`.
 *
 * @param {Core} core - The `@vercube/core` build to measure
 * @param {SchemaBuilder} z - zod
 * @param {LadderOptions} options - Variant, runtime and port
 * @returns {Promise<InstanceType<Core['App']>>} The application
 */
export async function createLadderApp(core: Core, z: SchemaBuilder, options: LadderOptions): Promise<InstanceType<Core['App']>> {
  const { BaseMiddleware, Body, Controller, Get, Header, Middleware, Param, Post, QueryParam, Redirect, SetHeader, Status } =
    core;

  const message = { message: 'Hello, World!' };
  const list = Array.from({ length: 50 }, (_, id) => ({ id, name: `item ${id}`, tags: ['a', 'b'], active: id % 2 === 0 }));
  const bodySchema = z.object({ name: z.string(), age: z.number() });
  const ageSchema = z.coerce.number();

  class NoopMiddleware extends BaseMiddleware {
    public override onRequest(): void {}
  }

  class SecondNoopMiddleware extends BaseMiddleware {
    public override onRequest(): void {}
  }

  class ThirdNoopMiddleware extends BaseMiddleware {
    public override onRequest(): void {}
  }

  class BothMiddleware extends BaseMiddleware {
    public override onRequest(): void {}

    public override onResponse(): void {}
  }

  class AuthMiddleware extends BaseMiddleware {
    public override onRequest(request: Request): void {
      if (request.headers.get('authorization') !== 'Bearer ladder') {
        throw new core.UnauthorizedError('Unauthorized');
      }
    }
  }

  class LadderController {}

  const controller = LadderController;
  const echo = (body: unknown): unknown => body;

  route(controller, 'plain', [Get('/plain')], [], () => message);
  route(controller, 'async', [Get('/async')], [], async () => message);
  route(controller, 'paramQuery', [Get('/id/:id')], [Param('id'), QueryParam({ name: 'name' })], (id: string, name: string) => ({
    id,
    name,
  }));
  route(controller, 'header', [Get('/header')], [Header('x-ladder')], (value: string) => ({ value }));
  route(
    controller,
    'querySchema',
    [Get('/query-schema')],
    [QueryParam({ name: 'age', validationSchema: ageSchema as never })],
    (age: number) => ({ age }),
  );
  route(controller, 'list', [Get('/list')], [], () => list);
  route(controller, 'status', [Get('/status'), Status(201)], [], () => message);
  route(controller, 'setHeader', [Get('/set-header'), SetHeader('x-ladder', '1')], [], () => message);
  route(controller, 'redirect', [Get('/redirect'), Redirect('/plain')], [], () => message);
  route(controller, 'mw1', [Get('/mw1'), Middleware(NoopMiddleware)], [], () => message);
  route(
    controller,
    'mw3',
    [Get('/mw3'), Middleware(NoopMiddleware), Middleware(SecondNoopMiddleware), Middleware(ThirdNoopMiddleware)],
    [],
    () => message,
  );
  route(controller, 'mwBoth', [Get('/mw-both'), Middleware(BothMiddleware)], [], () => message);
  route(controller, 'auth', [Get('/auth'), Middleware(AuthMiddleware)], [], () => message);
  route(controller, 'json', [Post('/json')], [Body()], echo);
  route(controller, 'jsonSchema', [Post('/json-schema')], [Body({ validationSchema: bodySchema as never })], echo);
  route(controller, 'jsonMw', [Post('/json-mw'), Middleware(NoopMiddleware)], [Body()], echo);
  route(controller, 'jsonAfter', [Post('/json-after'), Middleware(BothMiddleware)], [Body()], echo);
  route(controller, 'jsonStatus', [Post('/json-status'), Status(201)], [Body()], echo);
  route(
    controller,
    'jsonFull',
    [Post('/json-full'), Status(201), Middleware(AuthMiddleware)],
    [Body({ validationSchema: bodySchema as never })],
    echo,
  );

  Controller('/')(controller);

  const server = {
    runtime: options.runtime,
    host: '127.0.0.1',
    port: options.port,
  };

  const cfg =
    options.variant === 'bare'
      ? {
          requestLogging: false,
          requestContext: false,
          server: { ...server, static: { dirs: [] } },
        }
      : { server };

  return core.createApp({
    cfg: {
      logLevel: 'error',
      production: true,
      dev: false,
      c12: { dotenv: false },
      ...cfg,
    } as never,
    setup: (app) => {
      app.container.bind(controller);
    },
  });
}
