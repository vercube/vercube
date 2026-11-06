// Type-level tests, checked by `pnpm test:tscheck` (vitest does not run `.test-d.ts` files).
import { Controller, Get, HttpError, NotFoundError, Param } from '@vercube/core';
import { describe, expectTypeOf, it } from 'vitest';
import { createClient } from '../src';
import type { Jsonify, RouteDef, SseEvent, SseStream } from '../src';
import type { TestRoutes } from './fixtures/Controllers';
import type { VercubeRoutes } from './fixtures/routes';
import type { BadRequestError } from '@vercube/core';

const api = createClient<TestRoutes>({ baseURL: 'http://test', fetch: () => new Response() });

describe('types', () => {
  it('path params', () => {
    void api.get('/users/:id', { params: { id: '42' } });
    void api.get('/users/:id', { params: { id: 42 } });
    void api.get('/users/files/**:path', { params: { path: 'a/b.txt' } });
    // a segment no argument reads is still required
    void api.delete('/users/:id', { params: { id: '1' } });

    // @ts-expect-error params are required
    void api.get('/users/:id');
    // @ts-expect-error unknown param name
    void api.get('/users/:id', { params: { userId: '1' } });
    // @ts-expect-error not a GET route
    void api.get('/users/raw');
    // @ts-expect-error unknown route
    void api.get('/nope');
  });

  it('query', () => {
    void api.get('/users', { query: { sort: 'asc' } });
    void api.get('/users', { query: { sort: 'desc', page: 2, tag: ['a', 'b'] } });
    void api.get('/users/search', { query: { q: 'x', limit: 5 } });

    // @ts-expect-error `q` is required in the @QueryParams() object
    void api.get('/users/search');
    // @ts-expect-error `q` is required in the @QueryParams() object
    void api.get('/users/search', { query: { limit: 5 } });

    // @ts-expect-error `sort` is required by the handler
    void api.get('/users', { query: { page: 1 } });
    // @ts-expect-error literal union stays strict
    void api.get('/users', { query: { sort: 'up' } });
  });

  it('body and headers', () => {
    void api.post('/users', { body: { name: 'Oskar' }, headers: { 'x-tenant': 't1' } });
    void api.post('/users', {
      body: { name: 'Oskar', role: 'admin' },
      headers: { 'x-tenant': 't1', authorization: 'Bearer x' },
    });
    // optional body
    void api.put('/users/:id', { params: { id: '1' } });
    // raw bodies pass through
    void api.post('/users/raw', { body: new Blob(['x']) });
    void api.post('/users/raw', { body: new ReadableStream() });

    // @ts-expect-error missing required body field
    void api.post('/users', { body: {}, headers: { 'x-tenant': 't1' } });
    // @ts-expect-error wrong role
    void api.post('/users', { body: { name: 'a', role: 'root' }, headers: { 'x-tenant': 't1' } });
    // @ts-expect-error the handler reads x-tenant
    void api.post('/users', { body: { name: 'a' } });
    // @ts-expect-error no JSON body for a raw route
    void api.post('/users/raw', { body: { a: 1 } });
  });

  it('multipart', () => {
    void api.post('/users/:id/avatar', {
      params: { id: '1' },
      form: { file: new Blob(['x']), caption: 'me' },
    });
    void api.post('/users/:id/avatar', { params: { id: '1' }, form: new FormData() });

    // @ts-expect-error the upload must be a Blob
    void api.post('/users/:id/avatar', { params: { id: '1' }, form: { file: 'x', caption: 'me' } });
    // @ts-expect-error a multipart route takes `form`, not `body`
    void api.post('/users/:id/avatar', { params: { id: '1' }, body: { caption: 'me' } });
    // @ts-expect-error the handler requires the form
    void api.post('/users/:id/avatar', { params: { id: '1' } });
  });

  it('optional multipart', () => {
    class Upload {
      public put(form: { file: File } | undefined): number {
        return form ? 1 : 0;
      }
    }
    const up = createClient<{ 'PUT /file': RouteDef<Upload, 'put', { form: 0 }> }>();

    void up.put('/file');
    void up.put('/file', { form: { file: new Blob(['x']) } });
    // @ts-expect-error the upload must be a Blob
    void up.put('/file', { form: { file: 'x' } });
  });

  it('return types', () => {
    // Promise unwrapped, Date serialized
    expectTypeOf(api.get('/users/:id', { params: { id: '1' } })).resolves.toEqualTypeOf<{
      id: string;
      name: string;
      createdAt: string;
    }>();
    // raw Response
    expectTypeOf(api.get('/users/:id/avatar', { params: { id: '1' } })).resolves.toBeUnknown();
    // void
    expectTypeOf(api.delete('/users/:id', { params: { id: '1' } })).resolves.toBeVoid();
    // HEAD has no body
    expectTypeOf(api.head('/users/:id', { params: { id: '1' } })).resolves.toBeVoid();
    expectTypeOf(api.post('/users/raw')).resolves.toBeString();
    expectTypeOf(api.get('/users/fail')).toEqualTypeOf<Promise<never>>();
  });

  it('arrays serialize undefined and functions as null', () => {
    expectTypeOf<Jsonify<(string | undefined)[]>>().toEqualTypeOf<(string | null)[]>();
    expectTypeOf<Jsonify<[Date, undefined, () => void]>>().toEqualTypeOf<[string, null, null]>();
    // in an object the key is dropped instead, so it stays optional
    expectTypeOf<Jsonify<{ a?: string }>>().toEqualTypeOf<{ a?: string }>();
  });

  it('sse', () => {
    expectTypeOf(api.get('/events/ticks')).resolves.toEqualTypeOf<
      SseStream<SseEvent<{ n: number }, 'tick'> | SseEvent<undefined, 'done'>>
    >();

    expectTypeOf(api.get('/events/words')).resolves.toEqualTypeOf<SseStream<SseEvent<string, undefined>>>();
  });

  it('a controller under a moved path', () => {
    expectTypeOf(api.get('/v2/ping', { query: { echo: 'x' } })).resolves.toEqualTypeOf<{ echo: string }>();
    // @ts-expect-error the old path is gone
    void api.get('/old/ping', { query: { echo: 'x' } });
  });

  it('request() takes any method', () => {
    expectTypeOf(api.request('PUT', '/users/:id', { params: { id: '1' } })).resolves.toEqualTypeOf<{
      id: string;
      name?: string;
    }>();
  });

  it('a client without a route map takes anything', () => {
    const loose = createClient();

    expectTypeOf(loose.get('/anything', { query: { a: 1 } })).resolves.toBeAny();
  });

  it('the generated map is the hand-written one, plus HEAD for every GET', () => {
    expectTypeOf<Omit<VercubeRoutes, `HEAD ${string}`>>().toEqualTypeOf<Omit<TestRoutes, `HEAD ${string}`>>();
    // every GET has its HEAD twin, with the same definition
    type ExpectedHeads = {
      [K in keyof TestRoutes as K extends `GET ${infer Path}` ? `HEAD ${Path}` : never]: TestRoutes[K];
    };
    expectTypeOf<Pick<VercubeRoutes, Extract<keyof VercubeRoutes, `HEAD ${string}`>>>().toEqualTypeOf<ExpectedHeads>();
  });

  describe('errors', () => {
    type Errors<K extends keyof TestRoutes> = NonNullable<TestRoutes[K]['errors']>;

    it('are a union discriminated by status', () => {
      expectTypeOf<Errors<'GET /users/:id'>>().toEqualTypeOf<{ status: 404; name: string; message?: string }>();
      expectTypeOf<Errors<'GET /account'>['status']>().toEqualTypeOf<401 | 403 | 409>();

      const narrow = (error: Errors<'GET /account'>) => {
        if (error.status === 409) {
          expectTypeOf(error.existingId).toEqualTypeOf<string>();
          expectTypeOf(error.name).toEqualTypeOf<'ConflictError'>();
        } else {
          // @ts-expect-error only the 409 has it
          void error.existingId;
        }
      };
      void narrow;
    });

    it('get an implicit 400 with the validation issues when the route reads a body or a form', () => {
      type BadRequest = Extract<Errors<'POST /users'>, { status: 400 }>;

      expectTypeOf<Errors<'POST /users'>['status']>().toEqualTypeOf<400>();
      expectTypeOf<BadRequest['errors']>().toEqualTypeOf<Jsonify<NonNullable<BadRequestError['errors']>> | undefined>();
      expectTypeOf<Errors<'POST /users/:id/avatar'>['status']>().toEqualTypeOf<400>();
    });

    it('get an implicit 401 and 403 on secured routes, plus the controller ones', () => {
      expectTypeOf<Errors<'PUT /account/email'>['status']>().toEqualTypeOf<400 | 401 | 403 | 409 | 410>();
    });

    it('fall back to a generic body for a class the generator could not import', () => {
      expectTypeOf<Extract<Errors<'PUT /account/email'>, { status: 410 }>>().toEqualTypeOf<{
        status: 410;
        name: string;
        message?: string;
      }>();
    });

    it('are never for a route without any', () => {
      expectTypeOf<TestRoutes['GET /users/search']['errors']>().toBeNever();
    });

    it('type several classes under one status as a union', () => {
      class GoneError extends HttpError {
        public static readonly status: number = 410;
        public override name = 'GoneError' as const;
      }

      type Route = RouteDef<OrdersLike, 'get', { throws: { 404: NotFoundError; 410: GoneError | NotFoundError } }>;
      expectTypeOf<NonNullable<Route['errors']>['status']>().toEqualTypeOf<404 | 410>();
      expectTypeOf<Extract<NonNullable<Route['errors']>, { name: 'GoneError' }>['status']>().toEqualTypeOf<410>();
    });
  });

  it('changing a handler signature breaks the call site', () => {
    @Controller('/orders')
    class OrdersV1 {
      @Get('/:id')
      public get(@Param('id') id: string): { id: string } {
        return { id };
      }
    }

    @Controller('/orders')
    class OrdersV2 {
      @Get('/:orderId')
      public get(@Param('orderId') orderId: string): { orderId: string; total: number } {
        return { orderId, total: 0 };
      }
    }

    const v1 = createClient<{ 'GET /orders/:id': RouteDef<OrdersV1, 'get', { param: { id: 0 } }> }>();
    const v2 = createClient<{ 'GET /orders/:orderId': RouteDef<OrdersV2, 'get', { param: { orderId: 0 } }> }>();

    expectTypeOf(v1.get('/orders/:id', { params: { id: '1' } })).resolves.toEqualTypeOf<{ id: string }>();
    // @ts-expect-error the route moved to /orders/:orderId
    void v2.get('/orders/:id', { params: { id: '1' } });
    expectTypeOf(v2.get('/orders/:orderId', { params: { orderId: '1' } })).resolves.not.toHaveProperty('id');
  });
});

/** A minimal controller for route definitions made up in a test. */
class OrdersLike {
  public get(): { id: string } {
    return { id: '1' };
  }
}
