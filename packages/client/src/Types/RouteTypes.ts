/**
 * Turns a controller method into the shape the client needs.
 *
 * Nothing here is generated or printed: the generated `routes.d.ts` only names
 * the controller class, the method and the index each parameter decorator sits
 * at, and these types ask the compiler for the rest. Change the handler and the
 * client follows.
 */

/**
 * Where a handler reads each part of the request, as the generator writes it.
 *
 * Every number is the index of the handler argument carrying that decorator.
 */
export interface RouteArgs {
  /**
   * Path parameters by name. `null` marks a segment of the route template that
   * no handler argument reads; the client still has to fill it.
   */
  param?: Record<string, number | null>;
  /** `@QueryParam(name)` arguments by name. */
  query?: Record<string, number>;
  /** The `@QueryParams()` argument. */
  queries?: number;
  /** `@Header(name)` arguments by name. */
  header?: Record<string, number>;
  /** The `@Body()` argument. */
  body?: number;
  /** The `@MultipartFormData()` argument. */
  form?: number;
  /** Set on `@Sse()` routes. */
  sse?: true;
  /**
   * Errors the route answers with, by status: the error instance type, or a
   * union of them when several classes share a status. Declared with
   * `@Throws()`; the generator adds the ones the framework throws itself.
   */
  throws?: Record<number, object>;
}

/**
 * One route as the client sees it. `RouteDef` produces this; a hand-written
 * route map may too.
 */
export interface Route {
  /** Values for the `:segments` of the path. */
  params: object;
  /** Query string fields. */
  query: object;
  /** Headers the handler reads by name. */
  headers: object;
  /** The JSON body, `never` when the handler reads none. */
  body: unknown;
  /** The multipart form, `never` when the handler reads none. */
  form: unknown;
  /** What a successful call resolves to. */
  response: unknown;
  /**
   * The bodies of the error responses the route declares, a union
   * discriminated by `status`. `never` when it declares none. Optional, so a
   * hand-written route map without it still fits; a route without it has
   * `unknown` errors.
   */
  errors?: unknown;
}

/** A route map: `'GET /users/:id'` to its {@link Route}. */
export type Routes = Record<string, Route>;

/** Anything that is not an object worth recursing into. */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** True when `T` is `any`. */
type IsAny<T> = 0 extends 1 & T ? true : false;

/** True when `undefined` or `null` is part of `T`, so the field can be left out. */
type IsOptional<T> = IsAny<T> extends true ? true : undefined extends T ? true : null extends T ? true : false;

/** An object type without keys: a route part with nothing in it. */
export type Empty = Record<never, never>;

/** Flattens an intersection so hovers show one object. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * What `JSON.stringify` makes of a value, which is what the client receives:
 * `Date` (and anything with `toJSON`) becomes what `toJSON` returns, functions
 * and symbols disappear.
 */
export type Jsonify<T> =
  IsAny<T> extends true
    ? any
    : T extends Primitive | void
      ? T extends bigint | symbol
        ? never
        : T
      : T extends { toJSON(): infer J }
        ? Jsonify<J>
        : T extends Function
          ? never
          : T extends readonly unknown[]
            ? { [K in keyof T]: JsonItem<T[K]> }
            : { [K in keyof T as T[K] extends Function | symbol ? never : K]: Jsonify<T[K]> };

/** An array element: `JSON.stringify` writes `null` where an object would drop the key. */
type JsonItem<T> = IsAny<T> extends true ? any : T extends undefined | void | Function | symbol ? null : Jsonify<T>;

/** Fields `JSON.stringify` never writes for an error: `stack` and `cause` are not enumerable. */
type HiddenErrorFields = 'status' | 'message' | 'stack' | 'cause';

/**
 * The JSON body of an error response: the error's own fields, with `status`
 * fixed to the one it is declared under. `message` is only there when the
 * error was created with one. Distributes over unions.
 */
export type ErrorBody<E, S extends number> = E extends unknown
  ? Simplify<{ status: S } & Omit<Jsonify<E>, HiddenErrorFields> & { message?: string }>
  : never;

/** A `throws` key as a status: `404` and `'404'` alike. */
type StatusOf<K> = K extends number ? K : K extends `${infer N extends number}` ? N : never;

/** Every error body of a `throws` map, as one union. */
type ErrorsOf<T> = {
  [K in keyof T]-?: [StatusOf<K>] extends [never] ? never : ErrorBody<T[K], StatusOf<K>>;
}[keyof T];

/** What the handler returned, after `await`, without the error `Response`s. */
type Returned<R> = Exclude<Awaited<R>, Response>;

/**
 * The response type of a regular route. A handler that only returns a raw
 * `Response` says nothing about its body, so that becomes `unknown`.
 */
export type ResponseOf<R> =
  IsAny<R> extends true
    ? any
    : [Awaited<R>] extends [never]
      ? never
      : [Awaited<R>] extends [Response]
        ? unknown
        : Jsonify<Returned<R>>;

/** The element type of whatever an `@Sse()` handler returns. */
type YieldOf<R> = Returned<R> extends AsyncIterable<infer Y> ? Y : Returned<R> extends Iterable<infer Y> ? Y : unknown;

/** One event received from an `@Sse()` route. */
export interface SseEvent<D = unknown, E extends string | undefined = string | undefined> {
  /** The `data` of the message, parsed as JSON when it is JSON. */
  data: D;
  /** The `event` name, when the server set one. */
  event: E;
  /** The `id`, when the server set one. */
  id: string | undefined;
  /** The `retry` hint in milliseconds, when the server set one. */
  retry: number | undefined;
}

/** The event a yielded value turns into on the wire. Distributes over unions. */
export type SseEventOf<Y> = Y extends string | number | boolean
  ? SseEvent<Y, undefined>
  : Y extends object
    ? SseEvent<
        Y extends { data: infer D } ? Jsonify<D> : Y extends { data?: infer D } ? Jsonify<D> | undefined : undefined,
        Y extends { event: infer E extends string } ? E : string | undefined
      >
    : SseEvent;

/** The stream an `@Sse()` route resolves to. `return()` (or `break`) closes it. */
export type SseStream<E = SseEvent> = AsyncGenerator<E, void, undefined>;

/** A path parameter value: a literal union stays strict, anything else is a string or number. */
type ParamInput<T> =
  IsAny<T> extends true
    ? string | number
    : [NonNullable<T>] extends [string]
      ? string extends T
        ? string | number
        : Exclude<T, null | undefined>
      : string | number;

/** A query value. Arrays repeat the key (`?tag=a&tag=b`). */
type QueryInput<T> = T extends readonly (infer E)[] ? readonly QueryScalar<E>[] : QueryScalar<T>;

/** One query value: literal unions stay strict, anything else is stringified. */
type QueryScalar<T> =
  IsAny<T> extends true ? QueryValue : [T] extends [string] ? (string extends T ? QueryValue : T) : QueryValue;

/** Anything the client can put in a query string. */
export type QueryValue = string | number | boolean | Date;

/** A multipart field: uploads are `Blob`s, everything else is sent as text. */
type FormInput<T> = T extends readonly (infer E)[] ? readonly FormScalar<E>[] : FormScalar<T>;

/** One multipart value. */
type FormScalar<T> = T extends Blob ? Blob : string | number | boolean;

/** The handler argument at `I`, or `unknown` when there is none. */
type ArgAt<P extends readonly unknown[], I> = I extends keyof P ? P[I] : unknown;

/**
 * Whether a named field may be left out: its type admits a missing value, or it
 * is an array query field, which the server resolves to `[]` when absent.
 */
type CanOmit<T, Kind> =
  IsOptional<T> extends true ? true : Kind extends 'query' ? (T extends readonly unknown[] ? true : false) : false;

/** Required keys for non-optional arguments, optional keys for the rest. */
type Fields<P extends readonly unknown[], Map extends Record<string, number>, Kind extends 'query' | 'header'> = Simplify<
  {
    [K in keyof Map as CanOmit<ArgAt<P, Map[K]>, Kind> extends true ? never : K]: Input<ArgAt<P, Map[K]>, Kind>;
  } & {
    [K in keyof Map as CanOmit<ArgAt<P, Map[K]>, Kind> extends true ? K : never]?: Input<ArgAt<P, Map[K]>, Kind>;
  }
>;

/** The client-side type of one named field. */
type Input<T, Kind> = Kind extends 'query' ? QueryInput<NonNullable<T>> : string;

/** `@QueryParams()` object fields as query inputs. */
type QueryObject<T> =
  IsAny<T> extends true
    ? Record<string, QueryInput<QueryValue | QueryValue[]>>
    : T extends object
      ? { [K in keyof T]: QueryInput<T[K]> }
      : Empty;

/** The multipart input, as a `FormData` or a plain object of fields. */
type FormObject<T> =
  | FormData
  | (IsAny<T> extends true ? Record<string, unknown> : T extends object ? { [K in keyof T]: FormInput<T[K]> } : never);

/** Path parameters every route has, even when no argument reads them. */
type ParamsOf<P extends readonly unknown[], A extends RouteArgs> = A extends {
  param: infer M extends Record<string, number | null>;
}
  ? { [K in keyof M]: ParamInput<M[K] extends number ? ArgAt<P, M[K]> : string> }
  : Empty;

/** Query fields from `@QueryParam` and `@QueryParams`. */
type QueryOf<P extends readonly unknown[], A extends RouteArgs> = Simplify<
  (A extends { query: infer M extends Record<string, number> } ? Fields<P, M, 'query'> : Empty) &
    (A extends { queries: infer I extends number } ? QueryObject<NonNullable<ArgAt<P, I>>> : Empty)
>;

/**
 * Derives a {@link Route} from a controller method and the indexes of its
 * parameter decorators.
 *
 * @example
 * ```ts
 * type GetUser = RouteDef<UserController, 'getUser', { param: { id: 0 } }>;
 * ```
 */
export type RouteDef<C, M extends keyof C, A extends RouteArgs = Empty> = C[M] extends (...args: infer P) => infer R
  ? {
      params: ParamsOf<P, A>;
      query: QueryOf<P, A>;
      headers: A extends { header: infer H extends Record<string, number> } ? Fields<P, H, 'header'> : Empty;
      body: A extends { body: infer I extends number } ? ArgAt<P, I> : never;
      form: A extends { form: infer I extends number }
        ? // `undefined` stays when the handler accepts a request without a form
          FormObject<NonNullable<ArgAt<P, I>>> | (undefined extends ArgAt<P, I> ? undefined : never)
        : never;
      response: A extends { sse: true } ? SseStream<SseEventOf<YieldOf<R>>> : ResponseOf<R>;
      errors: A extends { throws: infer T extends Record<number, object> } ? ErrorsOf<T> : never;
    }
  : never;
