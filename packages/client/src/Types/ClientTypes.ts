import type { VercubeClientError } from '../Errors/VercubeClientError';
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

/**
 * The error a call to a route can fail with: one `VercubeClientError` per
 * declared error, so `switch (error.status)` narrows the body. A route that
 * declares none gets a plain `VercubeClientError`.
 *
 * Only declared errors are in the union. Any route can still answer with a
 * status it did not declare (a 500, an error from a middleware), which arrives
 * as the same error at runtime: keep a `default` branch.
 */
export type RouteError<E> = [E] extends [never]
  ? VercubeClientError
  : unknown extends E
    ? VercubeClientError
    : E extends { status: infer S extends number }
      ? VercubeClientError<E, S>
      : never;

/** The error of the route registered as `M P`. */
export type ErrorOf<R, M extends string, P extends string> = RouteError<Exclude<RouteAt<R, M, P>['errors'], undefined>>;

/** What a call through `api.safe` resolves to: the data or the error, never both. */
export type SafeResult<D, E> = { data: D; error: null; response: Response } | { data: null; error: E; response: Response };

/** A method shortcut such as `api.get`. */
type Call<R, M extends Method> = <P extends PathsOf<R, M>>(
  path: P,
  ...args: CallArgs<RouteAt<R, M, P>>
) => Promise<ResultOf<R, M, P>>;

/** A method shortcut of `api.safe`, such as `api.safe.get`. */
type SafeCall<R, M extends Method> = <P extends PathsOf<R, M>>(
  path: P,
  ...args: CallArgs<RouteAt<R, M, P>>
) => Promise<SafeResult<ResultOf<R, M, P>, ErrorOf<R, M, P>>>;

/** Every route id of a route map, `'GET /users/:id'` and so on. */
export type RouteIds<R> = string extends keyof R ? string : Extract<keyof R, string>;

/** The error of a route by its id. */
export type ErrorAt<R, K extends string> = K extends `${infer M} ${infer P}` ? ErrorOf<R, M, P> : VercubeClientError;

/**
 * The same calls as the client, resolving to `{ data, error, response }`
 * instead of rejecting when the server answers with an error status. Network
 * failures and aborts still reject: they are not answers.
 */
export interface SafeClient<R = Record<string, AnyRoute>> {
  get: SafeCall<R, 'GET'>;
  post: SafeCall<R, 'POST'>;
  put: SafeCall<R, 'PUT'>;
  patch: SafeCall<R, 'PATCH'>;
  delete: SafeCall<R, 'DELETE'>;
  head: SafeCall<R, 'HEAD'>;
  options: SafeCall<R, 'OPTIONS'>;
  /** Any method, for the ones without a shortcut. */
  request<M extends string, P extends PathsOf<R, M>>(
    method: M,
    path: P,
    ...args: CallArgs<RouteAt<R, M, P>>
  ): Promise<SafeResult<ResultOf<R, M, P>, ErrorOf<R, M, P>>>;
}

/** The client {@link createClient} returns. */
export interface Client<R = Record<string, AnyRoute>> {
  /** The same calls, returning errors instead of throwing them. */
  safe: SafeClient<R>;
  /**
   * Whether `error` is the error response of a call to `route`, typed with
   * the errors that route declares. For `try`/`catch` around the throwing calls.
   *
   * @example
   * ```ts
   * try {
   *   await api.get('/users/:id', { params: { id } });
   * } catch (error) {
   *   if (api.isRouteError(error, 'GET /users/:id') && error.status === 404) {
   *     // error.body is the NotFoundError body
   *   }
   * }
   * ```
   */
  isRouteError<K extends RouteIds<R>>(error: unknown, route: K): error is ErrorAt<R, K>;
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
