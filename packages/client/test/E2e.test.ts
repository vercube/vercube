// The client against a real Vercube application, in memory.
import { createApp } from '@vercube/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, VercubeClientError } from '../src';
import { AccountController, EventsController, GuardMiddleware, UserController } from './fixtures/Controllers';
import type { TestRoutes } from './fixtures/Controllers';
import type { App } from '@vercube/core';

let app: App;
let api: ReturnType<typeof createClient<TestRoutes>>;

beforeAll(async () => {
  app = await createApp({
    configFile: false,
    cfg: { requestLogging: false, logLevel: 'error' },
    setup: async (app) => {
      app.container.bind(UserController);
      app.container.bind(EventsController);
      app.container.bind(AccountController);
      app.container.bind(GuardMiddleware);
    },
  });
  api = createClient<TestRoutes>({ baseURL: 'http://test', fetch: (request) => app.fetch(request) });
});

afterAll(async () => {
  await app.close();
});

describe('against a Vercube app', () => {
  it('round-trips params, query, body and headers', async () => {
    expect(await api.get('/users/:id', { params: { id: '42' } })).toEqual({
      id: '42',
      name: 'user-42',
      createdAt: new Date(0).toISOString(),
    });

    expect(await api.get('/users', { query: { sort: 'asc', tag: ['a', 'b'], page: 3 } })).toEqual({
      page: '3',
      tag: ['a', 'b'],
      sort: 'asc',
    });

    expect(await api.post('/users', { body: { name: 'Oskar' }, headers: { 'x-tenant': 't1' } })).toMatchObject({
      name: 'Oskar',
      tenant: 't1',
    });

    expect(await api.get('/users/search', { query: { q: 'x', limit: 5 } })).toEqual({ q: 'x', limit: '5' });
  });

  it('sends multipart forms and raw bodies', async () => {
    expect(
      await api.post('/users/:id/avatar', { params: { id: '1' }, form: { file: new Blob(['png!']), caption: 'me' } }),
    ).toEqual({ id: '1', size: 4, caption: 'me' });

    expect(await api.post('/users/raw', { body: new Blob(['raw text']) })).toBe('raw text');
  });

  it('keeps slashes in a wildcard param', async () => {
    expect(await api.get('/users/files/**:path', { params: { path: 'a/b c.txt' } })).toBe('a/b c.txt');
  });

  it('throws on error responses', async () => {
    const error = await api.get('/users/fail').catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(VercubeClientError);
    expect((error as VercubeClientError).status).toBe(500);
  });

  describe('safe', () => {
    it('resolves to the data and the response on success', async () => {
      const res = await api.safe.get('/users/:id', { params: { id: '42' } });

      expect(res.error).toBeNull();
      expect(res.data).toMatchObject({ id: '42' });
      expect(res.response.status).toBe(200);
    });

    it('resolves to a declared error instead of throwing', async () => {
      const res = await api.safe.get('/users/:id', { params: { id: 'missing' } });

      expect(res.data).toBeNull();
      expect(res.error).toBeInstanceOf(VercubeClientError);
      expect(res.error?.status).toBe(404);
      expect(res.error?.body).toEqual({ status: 404, name: 'NotFoundError', message: 'No such user' });
      expect(res.response.status).toBe(404);
    });

    it('carries the fields of a custom error, and the implicit 400 of a body that is not JSON', async () => {
      const conflict = await api.safe.put('/account/email', { body: { email: 'taken@example.com' } });

      expect(conflict.error?.body).toEqual({ status: 409, name: 'ConflictError', message: 'Already exists', existingId: '7' });

      const invalid = await api.safe.post('/users', {
        body: new Blob(['{'], { type: 'application/json' }),
        headers: { 'x-tenant': 't', 'content-type': 'application/json' },
      });

      expect(invalid.error?.status).toBe(400);
      expect(invalid.error?.body).toMatchObject({ status: 400, name: 'BadRequestError' });
    });

    it('resolves to an undeclared error too', async () => {
      const res = await api.safe.get('/users/fail');

      expect(res.error?.status).toBe(500);
    });

    it('works through request() and for HEAD', async () => {
      expect((await api.safe.request('GET', '/users/:id', { params: { id: 'missing' } })).error?.status).toBe(404);
      expect(await api.safe.head('/users/:id', { params: { id: '1' } })).toMatchObject({ data: undefined, error: null });
    });
  });

  it('tells a route error apart with isRouteError', async () => {
    const error = await api.get('/users/:id', { params: { id: 'missing' } }).catch((error: unknown) => error);

    expect(api.isRouteError(error, 'GET /users/:id')).toBe(true);
    expect(api.isRouteError(error, 'PUT /account/email')).toBe(false);
    expect(api.isRouteError(new Error('nope'), 'GET /users/:id')).toBe(false);
    expect((error as VercubeClientError).route).toBe('GET /users/:id');
  });

  it('streams SSE events', async () => {
    const events = [];

    for await (const event of await api.get('/events/ticks')) {
      events.push(event);
    }

    expect(events.map((e) => [e.event, e.data])).toEqual([
      ['tick', { n: 1 }],
      ['tick', { n: 2 }],
      ['done', undefined],
    ]);

    const words = [];

    for await (const event of await api.get('/events/words')) {
      words.push(event.data);
    }

    expect(words).toEqual(['hello', 'world']);
  });
});
