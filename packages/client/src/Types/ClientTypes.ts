import type { Empty, QueryValue, Route } from './RouteTypes';

/** HTTP methods the client has a shortcut for. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** The `fetch` the client calls. `globalThis.fetch` fits, so does `app.fetch`. */
export type FetchLike = (request: Request) => Response | Promise<Response>;

/** Hook context before the request is sent. */
export interface RequestContext {
  request: Request;
}

/** Hook context once a response arrived. */
export interface ResponseContext {
  request: Request;
  response: Response;
}

/** Options for {@link createClient}. */
export interface ClientOptions {
  /** Prepended to every path, e.g. `http://localhost:3000` or `/api`. */
  baseURL?: string;
  /** Replaces `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Sent with every request; a function is called (and awaited) per request. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** Runs before each request. Returning a `Request` replaces it. */
  onRequest?: (context: RequestContext) => void | Request | Promise<void | Request>;
  /**
   * Runs after each response, error responses included. Returning a `Response`
   * replaces it. The hook gets a copy, so reading its body leaves the client's
   * intact; an event stream is the exception, its body is the client's.
   */
  onResponse?: (context: ResponseContext) => void | Response | Promise<void | Response>;
}

/** Bodies passed through as they are, without JSON encoding. */
export type RawBody = Blob | ReadableStream | ArrayBuffer | ArrayBufferView | FormData | URLSearchParams;

/** `fetch` options the client does not compute itself. */
type BaseInit = Omit<RequestInit, 'body' | 'method' | 'headers'>;

/** `params`, required whenever the path has a segment to fill. */
type ParamsInit<P> = Empty extends P ? { params?: P } : { params: P };

/** `query`, required when the handler requires a field. */
type QueryInit<Q> = Empty extends Q ? { query?: Q } : { query: Q };

/** `headers`: the named ones the handler reads, plus anything else. */
type HeadersInit_<H> = Empty extends H ? { headers?: HeadersInit } : { headers: H & Record<string, string> };

/** `body` or `form`, depending on what the handler reads. */
type BodyInit_<B, F> = [B] extends [never]
  ? [F] extends [never]
    ? { body?: RawBody; form?: undefined }
    : undefined extends F
      ? { form?: Exclude<F, undefined>; body?: undefined }
      : Empty extends F
        ? { form?: F; body?: undefined }
        : { form: F; body?: undefined }
  : undefined extends B
    ? { body?: B | RawBody; form?: undefined }
    : { body: B | RawBody; form?: undefined };

/** The second argument of a call, built from the route. */
export type CallInit<R extends Route> = BaseInit &
  ParamsInit<R['params']> &
  QueryInit<R['query']> &
  HeadersInit_<R['headers']> &
  BodyInit_<R['body'], R['form']>;

/** The init is optional when nothing in it is required. */
export type CallArgs<R extends Route> = Empty extends CallInit<R> ? [init?: CallInit<R>] : [init: CallInit<R>];

/** A route the client knows nothing about: a client created without a route map. */
export interface AnyRoute extends Route {
  params: Record<string, string | number>;
  query: Record<string, QueryValue | readonly QueryValue[] | null | undefined>;
  headers: Empty;
  body: unknown;
  form: never;
  response: any;
}

/** Every path registered for `M`. Any string when the map is untyped. */
export type PathsOf<R, M extends string> = string extends keyof R
  ? string
  : { [K in keyof R]: K extends `${M} ${infer P}` ? P : never }[keyof R];

/** The route registered as `M P`. */
export type RouteAt<R, M extends string, P extends string> = `${M} ${P}` extends keyof R
  ? R[`${M} ${P}`] extends infer D extends Route
    ? D
    : AnyRoute
  : AnyRoute;

/** What a call to `M P` resolves to. `HEAD` responses have no body. */
export type ResultOf<R, M extends string, P extends string> = M extends 'HEAD' ? void : RouteAt<R, M, P>['response'];

/** A method shortcut such as `api.get`. */
type Call<R, M extends Method> = <P extends PathsOf<R, M>>(
  path: P,
  ...args: CallArgs<RouteAt<R, M, P>>
) => Promise<ResultOf<R, M, P>>;

/** The client {@link createClient} returns. */
export interface Client<R = Record<string, AnyRoute>> {
  get: Call<R, 'GET'>;
  post: Call<R, 'POST'>;
  put: Call<R, 'PUT'>;
  patch: Call<R, 'PATCH'>;
  delete: Call<R, 'DELETE'>;
  head: Call<R, 'HEAD'>;
  options: Call<R, 'OPTIONS'>;
  /** Any method, for the ones without a shortcut. */
  request<M extends string, P extends PathsOf<R, M>>(
    method: M,
    path: P,
    ...args: CallArgs<RouteAt<R, M, P>>
  ): Promise<ResultOf<R, M, P>>;
}
