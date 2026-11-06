import { VercubeClientError } from './Errors/VercubeClientError';
import { parseSse } from './Sse';
import type { AnyRoute, Client, ClientOptions, Method } from './Types/ClientTypes';

/** What a call may carry, before the types narrow it per route. */
interface Init extends Omit<RequestInit, 'body' | 'method' | 'headers'> {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: HeadersInit;
  body?: unknown;
  form?: unknown;
}

/** `:name` and `**:name` segments of a route template. */
const SEGMENT = /(\*\*)?:(\w+)/g;

/** Method shortcuts, by property name. */
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Creates a client for a Vercube application.
 *
 * Pass the generated route map to type every call:
 *
 * ```ts
 * import type { VercubeRoutes } from './.vercube/routes';
 *
 * const api = createClient<VercubeRoutes>({ baseURL: 'http://localhost:3000' });
 * const user = await api.get('/users/:id', { params: { id: '42' } });
 * ```
 *
 * Calls resolve to the parsed body (JSON, otherwise text, `undefined` when
 * empty), to an async iterable of events for `text/event-stream`, and reject
 * with a {@link VercubeClientError} for any status that is not 2xx.
 *
 * @param options - Base URL, `fetch`, default headers and hooks
 * @returns The client
 */
export function createClient<R = Record<string, AnyRoute>>(options: ClientOptions = {}): Client<R> {
  const request = async (method: string, path: string, init: Init = {}): Promise<unknown> => {
    const { params, query, headers, body, form, ...rest } = init;
    // unbound `fetch` throws "Illegal invocation" in browsers
    const fetcher = options.fetch ?? ((input: Request) => fetch(input));
    const merged = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
    let payload: BodyInit | undefined;

    for (const [key, value] of new Headers(headers)) {
      merged.set(key, value);
    }

    if (form !== undefined) {
      payload = form instanceof FormData ? form : toFormData(form as Record<string, unknown>);
      // a default `application/json` would win over the multipart boundary `Request` sets
      merged.delete('content-type');
    } else if (body !== undefined) {
      if (isRaw(body)) {
        payload = body as BodyInit;
      } else {
        payload = JSON.stringify(body);

        if (!merged.has('content-type')) {
          merged.set('content-type', 'application/json');
        }
      }
    }

    let req = new Request(joinUrl(options.baseURL ?? '', fillPath(path, params), toQuery(query)), {
      ...rest,
      method: method.toUpperCase(),
      headers: merged,
      body: payload,
      // required by Node (and the spec) to send a stream
      ...(payload instanceof ReadableStream ? { duplex: 'half' } : {}),
    } as RequestInit);

    req = (await options.onRequest?.({ request: req })) ?? req;

    // an in-memory fetch such as `app.fetch` does not look at the signal
    req.signal.throwIfAborted();

    let res = await fetcher(req);

    res = (await options.onResponse?.({ request: req, response: res })) ?? res;

    if (!res.ok) {
      throw new VercubeClientError(res, await readBody(res, true));
    }

    if (req.method === 'HEAD') {
      return undefined;
    }

    if (res.body && res.headers.get('content-type')?.startsWith('text/event-stream')) {
      // the final request's signal: `onRequest` may have replaced it
      return parseSse(res.body, req.signal);
    }

    return readBody(res);
  };

  const client: Record<string, unknown> = { request };

  for (const method of METHODS) {
    client[method.toLowerCase()] = (path: string, init?: Init) => request(method, path, init);
  }

  return client as never;
}

/**
 * @param response - Any response
 * @param lenient - Keep the text when JSON does not parse, so an error status is not lost to a `SyntaxError`
 * @returns JSON when it is JSON, the text otherwise, `undefined` when empty
 */
async function readBody(response: Response, lenient = false): Promise<unknown> {
  const text = await response.text();

  if (text === '') {
    return undefined;
  }

  if (!/[/+]json\b/.test(response.headers.get('content-type') ?? '')) {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (lenient) {
      return text;
    }

    throw error;
  }
}

/**
 * @param base - The `baseURL`
 * @param path - The filled path, which may already carry a query string
 * @param query - `?...` built from `query`, or an empty string
 * @returns The URL, with one slash at the join and one `?`
 */
function joinUrl(base: string, path: string, query: string): string {
  const joined = base.endsWith('/') && path.startsWith('/') ? base + path.slice(1) : base + path;

  if (!query) {
    return joined;
  }

  // the query goes before a `#fragment`, or the server never sees it
  const hash = joined.indexOf('#');
  const url = hash === -1 ? joined : joined.slice(0, hash);
  const fragment = hash === -1 ? '' : joined.slice(hash);

  return (url.includes('?') ? `${url}&${query.slice(1)}` : url + query) + fragment;
}

/**
 * Fills the `:segments` of a route template. A `**:name` wildcard keeps the
 * slashes of its value.
 *
 * @param path - The route template
 * @param params - Values by segment name
 * @returns The path
 */
function fillPath(path: string, params: Record<string, unknown> = {}): string {
  return path.replace(SEGMENT, (_, wildcard: string | undefined, name: string) => {
    const value = params[name];

    if (value === undefined || value === null) {
      throw new TypeError(`Missing path parameter "${name}" for ${path}`);
    }

    const segments = wildcard ? String(value).split('/') : [String(value)];

    // the URL parser resolves these, so `../admin` would reach another route
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new TypeError(`Path parameter "${name}" cannot be "." or ".." in ${path}`);
    }

    return segments.map(encodeURIComponent).join('/');
  });
}

/**
 * Builds a query string. Arrays repeat the key, which a handler only reads as
 * an array when it opted in (`@QueryParam({ array: true })`); otherwise it
 * takes the first value. `null` and `undefined` are left out.
 *
 * @param query - Fields to send
 * @returns `?...`, or an empty string
 */
function toQuery(query: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) {
        search.append(key, item instanceof Date ? item.toISOString() : String(item));
      }
    }
  }

  const text = search.toString();

  return text ? `?${text}` : '';
}

/**
 * @param fields - Form fields; arrays repeat the field, `Blob`s become uploads
 * @returns The form
 */
function toFormData(fields: Record<string, unknown>): FormData {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) {
        form.append(key, item instanceof Blob ? item : String(item));
      }
    }
  }

  return form;
}

/**
 * @param body - A request body
 * @returns True for bodies `fetch` sends as they are
 */
function isRaw(body: unknown): boolean {
  return (
    body instanceof Blob ||
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  );
}
