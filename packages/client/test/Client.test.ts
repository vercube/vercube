import { describe, expect, it, vi } from 'vitest';
import { createClient, VercubeClientError } from '../src';
import type { TestRoutes } from './fixtures/Controllers';

/** A client whose fetch records the request and answers with `response`. */
function setup(response: () => Response = () => Response.json({ ok: true })) {
  const seen: Request[] = [];
  const fetch = vi.fn(async (request: Request) => {
    seen.push(request);

    return response();
  });

  return { api: createClient<TestRoutes>({ baseURL: 'http://test', fetch }), seen, fetch };
}

describe('createClient', () => {
  it('fills and encodes path params', async () => {
    const { api, seen } = setup();

    await api.get('/users/:id', { params: { id: 'a b/c' } });
    await api.get('/users/files/**:path', { params: { path: 'dir one/file.txt' } });

    expect(seen[0].url).toBe('http://test/users/a%20b%2Fc');
    expect(seen[1].url).toBe('http://test/users/files/dir%20one/file.txt');
  });

  it('throws on a missing path param', async () => {
    const { api } = setup();

    await expect(api.get('/users/:id', { params: {} as never })).rejects.toThrow('Missing path parameter "id"');
  });

  it('serializes the query: arrays repeat, nullish is dropped, dates are ISO', async () => {
    const { seen } = setup();
    const loose = createClient({ baseURL: 'http://test', fetch: async (r) => (seen.push(r), Response.json(null)) });

    await loose.get('/users', {
      query: { sort: 'asc', tag: ['a', 'b'], page: undefined, n: null, at: new Date(0), ok: true },
    });

    expect(new URL(seen[0].url).search).toBe('?sort=asc&tag=a&tag=b&at=1970-01-01T00%3A00%3A00.000Z&ok=true');
  });

  it('sends JSON bodies with a content type', async () => {
    const { api, seen } = setup();

    await api.post('/users', { body: { name: 'Oskar' }, headers: { 'x-tenant': 't1' } });

    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers.get('content-type')).toBe('application/json');
    expect(seen[0].headers.get('x-tenant')).toBe('t1');
    expect(await seen[0].json()).toEqual({ name: 'Oskar' });
  });

  it('passes Blob and stream bodies through', async () => {
    const { api, seen } = setup();

    await api.post('/users/raw', { body: new Blob(['blob'], { type: 'text/plain' }) });
    await api.post('/users/raw', {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'));
          controller.close();
        },
      }),
    });

    expect(seen[0].headers.get('content-type')).toBe('text/plain');
    expect(await seen[0].text()).toBe('blob');
    expect(await seen[1].text()).toBe('stream');
  });

  it('sends `form` as multipart', async () => {
    const { api, seen } = setup();

    await api.post('/users/:id/avatar', {
      params: { id: '1' },
      form: { file: new Blob(['png']), caption: 'me' },
    });

    expect(seen[0].headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);

    const form = await seen[0].formData();

    expect(form.get('caption')).toBe('me');
    expect(await (form.get('file') as Blob).text()).toBe('png');
  });

  it('merges static, async and per-call headers', async () => {
    const seen: Request[] = [];
    const fetch = async (r: Request) => (seen.push(r), Response.json({}));
    const a = createClient<TestRoutes>({ baseURL: 'http://test', fetch, headers: { 'x-a': '1', 'x-b': '1' } });
    const b = createClient<TestRoutes>({ baseURL: 'http://test', fetch, headers: async () => ({ authorization: 'Bearer t' }) });

    await a.get('/users/:id', { params: { id: '1' }, headers: { 'x-b': '2' } });
    await b.get('/users/:id', { params: { id: '1' } });

    expect(seen[0].headers.get('x-a')).toBe('1');
    expect(seen[0].headers.get('x-b')).toBe('2');
    expect(seen[1].headers.get('authorization')).toBe('Bearer t');
  });

  it('runs the hooks, which may replace the request and the response', async () => {
    const order: string[] = [];
    const api = createClient<TestRoutes>({
      baseURL: 'http://test',
      fetch: async (r) => Response.json({ via: r.headers.get('x-hook') }),
      onRequest: ({ request }) => {
        order.push('request');
        const next = new Request(request);
        next.headers.set('x-hook', 'yes');
        return next;
      },
      onResponse: async ({ response }) => {
        order.push('response');
        return Response.json({ wrapped: await response.json() });
      },
    });

    expect(await api.get('/users/:id', { params: { id: '1' } })).toEqual({ wrapped: { via: 'yes' } });
    expect(order).toEqual(['request', 'response']);
  });

  it('reads JSON, text and empty bodies', async () => {
    const body = { current: (): Response => Response.json({ a: 1 }) };
    const { api } = setup(() => body.current());

    expect(await api.get('/users/:id', { params: { id: '1' } })).toEqual({ a: 1 });

    body.current = () => new Response('plain', { headers: { 'content-type': 'text/plain' } });
    expect(await api.post('/users/raw')).toBe('plain');

    body.current = () => new Response(null, { status: 204 });
    expect(await api.delete('/users/:id', { params: { id: '1' } })).toBeUndefined();

    body.current = () => new Response(null, { headers: { 'content-length': '3' } });
    expect(await api.head('/users/:id', { params: { id: '1' } })).toBeUndefined();
  });

  it('throws VercubeClientError with the parsed body', async () => {
    const { api } = setup(() => Response.json({ message: 'Not found', code: 'E_USER' }, { status: 404 }));
    const error = await api.get('/users/:id', { params: { id: '1' } }).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(VercubeClientError);
    expect(error).toMatchObject({ status: 404, message: 'Not found', body: { message: 'Not found', code: 'E_USER' } });
    expect((error as VercubeClientError).response.status).toBe(404);
  });

  it('falls back to the status text for non-JSON errors', async () => {
    const { api } = setup(() => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }));
    const error = (await api.get('/users/fail').catch((error_: unknown) => error_)) as VercubeClientError;

    expect(error.message).toBe('502 Bad Gateway');
    expect(error.body).toBe('bad gateway');
  });

  it('aborts with the signal', async () => {
    const api = createClient<TestRoutes>({
      baseURL: 'http://test',
      fetch: (request) =>
        new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))),
    });
    const controller = new AbortController();
    const pending = api.get('/users/:id', { params: { id: '1' }, signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('works with a relative baseURL through a custom fetch', async () => {
    const seen: string[] = [];
    const api = createClient<TestRoutes>({
      baseURL: 'http://host/api',
      fetch: async (r) => (seen.push(r.url), Response.json({})),
    });

    await api.request('GET', '/users/:id', { params: { id: '7' } });

    expect(seen).toEqual(['http://host/api/users/7']);
  });

  it('lets a form set its own content type over a default JSON one', async () => {
    const seen: Request[] = [];
    const api = createClient<TestRoutes>({
      baseURL: 'http://test',
      headers: { 'content-type': 'application/json' },
      fetch: async (r) => (seen.push(r), Response.json({})),
    });

    await api.post('/users/:id/avatar', { params: { id: '1' }, form: { file: new Blob(['x']), caption: 'me' } });

    expect(seen[0].headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('joins baseURL and path with one slash and merges an existing query string', async () => {
    const seen: string[] = [];
    const fetch = async (r: Request) => (seen.push(r.url), Response.json({}));

    await createClient<TestRoutes>({ baseURL: 'http://test/api/', fetch }).get('/users/:id', { params: { id: '1' } });
    await createClient({ baseURL: 'http://test', fetch }).get('/search?q=alice', { query: { page: 2 } });

    expect(seen).toEqual(['http://test/api/users/1', 'http://test/search?q=alice&page=2']);
  });

  it('refuses path parameters that would climb to another route', async () => {
    const { api, fetch } = setup();

    await expect(api.get('/users/:id', { params: { id: '..' } })).rejects.toThrow('cannot be "." or ".."');
    await expect(api.get('/users/files/**:path', { params: { path: 'a/../../search' } })).rejects.toThrow(TypeError);
    // encoded inside a segment, a dot is harmless
    await api.get('/users/:id', { params: { id: 'a..b' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the HTTP error when its JSON body is broken', async () => {
    const { api } = setup(() => new Response('{"message":', { status: 500, headers: { 'content-type': 'application/json' } }));
    const error = (await api.get('/users/fail').catch((error_: unknown) => error_)) as VercubeClientError;

    expect(error).toBeInstanceOf(VercubeClientError);
    expect(error.status).toBe(500);
    expect(error.body).toBe('{"message":');
  });

  it('aborts a request already in flight', async () => {
    let started!: () => void;
    const inFlight = new Promise<void>((resolve) => (started = resolve));
    const api = createClient<TestRoutes>({
      baseURL: 'http://test',
      fetch: (request) =>
        new Promise((_, reject) => {
          started();
          request.signal.addEventListener('abort', () => reject(request.signal.reason));
        }),
    });
    const controller = new AbortController();
    const pending = api.get('/users/:id', { params: { id: '1' }, signal: controller.signal });

    await inFlight;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
