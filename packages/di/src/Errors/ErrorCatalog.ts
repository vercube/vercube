import { GUIDANCE_BRAND, GUIDANCE_BRAND_DESCRIPTOR } from './ErrorGuidance';
import type { ErrorGuidance } from './ErrorGuidance';

/** Where the documentation of an error code lives. */
const DOCS_URL = 'https://vercube.dev/docs/core-features/errors';

/**
 * One error of a catalog. The shape follows evlog's `ErrorCatalogEntry`, with
 * `create` added so an entry can keep the error class callers already catch.
 *
 * `why` and `fix` are plain strings on purpose: only `message` is built from
 * values, so nothing taken from a request or a payload can end up in them.
 */
export interface ErrorCatalogEntry<P = any> {
  /** The message, fixed or built from the parameters the error is created with. */
  message: string | ((params: P) => string);
  /** Why the error happens. */
  why: string;
  /** What to do about it: the exact decorator, option or command. */
  fix: string;
  /** The documentation page. Defaults to the entry of the code in the error reference. */
  link?: string;
  /** HTTP status the error is answered with, for an error that is not an `HttpError`. */
  status?: number;
  /** Whether `why`, `fix` and `link` may reach a client outside development. */
  expose?: boolean;
  /** Builds the error. Defaults to the catalog's `create`, then to a plain `Error`. */
  create?: (message: string, params: P) => Error;
}

/** What a call site may add to an error of a catalog. */
export interface ErrorFactoryOverrides {
  /** The error that caused this one. */
  cause?: unknown;
  /** Context for whoever reads the log. Never sent to a client. */
  internal?: Record<string, unknown>;
}

/** The parameters the message of an entry is built from. */
type EntryParams<TEntry> = TEntry extends { message: (params: infer P) => string } ? P : never;

/** The error an entry builds. */
type EntryError<TEntry, TDefault> = TEntry extends { create: (...args: never[]) => infer E } ? E : TDefault;

/**
 * The arguments of a factory: the parameters of the message, then the
 * overrides. The parameters may be left out when the message takes none, or
 * takes them optionally.
 */
type FactoryArgs<TEntry> = [EntryParams<TEntry>] extends [never]
  ? [params?: undefined, overrides?: ErrorFactoryOverrides]
  : unknown extends EntryParams<TEntry>
    ? [params?: undefined, overrides?: ErrorFactoryOverrides]
    : undefined extends EntryParams<TEntry>
      ? [params?: EntryParams<TEntry>, overrides?: ErrorFactoryOverrides]
      : [params: EntryParams<TEntry>, overrides?: ErrorFactoryOverrides];

/** Creates one error of a catalog. Its metadata is readable without creating one. */
export type ErrorFactory<TCode extends string, TEntry, TDefault = Error> = ((
  ...args: FactoryArgs<TEntry>
) => EntryError<TEntry, TDefault>) & {
  readonly code: TCode;
  readonly why: string;
  readonly fix: string;
  readonly link: string;
  readonly status: number | undefined;
};

/** What a catalog tells tools that list its errors. */
export interface ErrorCatalogDescription {
  code: string;
  /** The message with every parameter shown as `<name>`. */
  message: string;
  why: string;
  fix: string;
  link: string;
  status?: number;
}

/** The object {@link defineErrorCatalog} returns: one factory per entry. */
export type ErrorCatalog<TPrefix extends string, TMap extends Record<string, ErrorCatalogEntry>, TDefault = Error> = {
  readonly [K in keyof TMap & string]: ErrorFactory<`${TPrefix}_${K}`, TMap[K], TDefault>;
} & {
  /** The prefix every code of the catalog starts with. */
  readonly prefix: TPrefix;
  /** Every error of the catalog, for documentation and tests. */
  describe(): ErrorCatalogDescription[];
};

/** Options of {@link defineErrorCatalog}. */
export interface ErrorCatalogOptions<TDefault extends Error> {
  /** Builds the error of every entry that has no `create` of its own. */
  create?: (message: string) => TDefault;
}

/**
 * Defines the errors of a package in one place. Each entry becomes a factory
 * that builds the error with its code, why and fix attached:
 *
 * @example
 * ```ts
 * export const BillingErrors = defineErrorCatalog('BILLING', {
 *   PLAN_LIMIT: {
 *     message: ({ limit }: { limit: number }) => `Plan limit of ${limit} projects reached`,
 *     why: 'The workspace is on a plan with a fixed number of projects.',
 *     fix: 'Upgrade the workspace, or delete a project.',
 *     create: (message) => new ForbiddenError(message),
 *   },
 * });
 *
 * throw BillingErrors.PLAN_LIMIT({ limit: 3 });
 * // error.code === 'BILLING_PLAN_LIMIT', error instanceof ForbiddenError
 * ```
 *
 * @param {TPrefix} prefix - What every code starts with, for example `VERCUBE_DI`
 * @param {TMap} map - The entries, keyed by the rest of the code
 * @param {ErrorCatalogOptions<TDefault>} [options] - The error class of the catalog
 * @returns {ErrorCatalog<TPrefix, TMap, TDefault>} One factory per entry
 */
export function defineErrorCatalog<
  const TPrefix extends string,
  const TMap extends Record<string, ErrorCatalogEntry>,
  TDefault extends Error = Error,
>(prefix: TPrefix, map: TMap, options: ErrorCatalogOptions<TDefault> = {}): ErrorCatalog<TPrefix, TMap, TDefault> {
  const catalog: Record<string, unknown> = {};
  const descriptions: ErrorCatalogDescription[] = [];

  for (const [key, entry] of Object.entries(map)) {
    const code = `${prefix}_${key}`;
    const link = entry.link ?? `${DOCS_URL}#${code.toLowerCase()}`;
    const guidance: ErrorGuidance = { code, why: entry.why, fix: entry.fix, link, expose: entry.expose };

    // Built once: an error on a request path is described with one call and
    // no allocation of its own.
    const descriptors: PropertyDescriptorMap = {};

    for (const [field, value] of Object.entries(guidance)) {
      if (value !== undefined) {
        descriptors[field] = { value, enumerable: false, writable: true, configurable: true };
      }
    }

    (descriptors as Record<symbol, PropertyDescriptor>)[GUIDANCE_BRAND] = GUIDANCE_BRAND_DESCRIPTOR;

    const create = entry.create ?? options.create;
    const message = entry.message;

    const factory = (params?: unknown, overrides?: ErrorFactoryOverrides): Error => {
      const text = typeof message === 'function' ? message(params) : message;
      // bare-error: the default class of a catalog
      const error = create ? create(text, params) : new Error(text);

      // an error that cannot take new fields is still the error to throw
      if (!Object.isExtensible(error)) {
        return error;
      }

      // The trace starts where the error was thrown, not in this function.
      // Nothing is captured for an error created with the stack turned off.
      if (Error.stackTraceLimit !== 0) {
        Error.captureStackTrace?.(error, factory);
      }

      Object.defineProperties(error, descriptors);

      // a status is only given to an error that has none: an HttpError keeps its own
      if (entry.status !== undefined && (error as { status?: unknown }).status === undefined) {
        Object.defineProperty(error, 'status', { value: entry.status, enumerable: false, writable: true, configurable: true });
      }

      if (overrides !== undefined) {
        if (overrides.cause !== undefined) {
          Object.defineProperty(error, 'cause', {
            value: overrides.cause,
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }

        if (overrides.internal !== undefined) {
          Object.defineProperty(error, 'internal', {
            value: overrides.internal,
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }

      return error;
    };

    Object.defineProperties(factory, {
      code: { value: code, enumerable: true },
      why: { value: entry.why, enumerable: true },
      fix: { value: entry.fix, enumerable: true },
      link: { value: link, enumerable: true },
      status: { value: entry.status, enumerable: true },
    });

    catalog[key] = factory;
    descriptions.push({ code, message: describeMessage(message), why: entry.why, fix: entry.fix, link, status: entry.status });
  }

  Object.defineProperties(catalog, {
    prefix: { value: prefix, enumerable: false },
    describe: { value: () => descriptions.map((description) => ({ ...description })), enumerable: false },
  });

  return catalog as ErrorCatalog<TPrefix, TMap, TDefault>;
}

/**
 * Renders a message for a list of errors: a built message is called with
 * parameters that name themselves, so `Route ${path} not found` becomes
 * `Route <path> not found`.
 *
 * @param {ErrorCatalogEntry['message']} message - The message of an entry
 * @returns {string} The message, with its parameters named
 */
function describeMessage(message: ErrorCatalogEntry['message']): string {
  if (typeof message === 'string') {
    return message;
  }

  const placeholder = (name: string): unknown =>
    new Proxy(
      Object.assign(() => `<${name}>`, {}),
      {
        get: (_target, key) => {
          if (key === Symbol.toPrimitive || key === 'toString' || key === 'valueOf' || key === 'toJSON') {
            return () => `<${name}>`;
          }

          return typeof key === 'symbol' ? undefined : placeholder(`${name}.${key}`);
        },
      },
    );

  try {
    return message(
      new Proxy(
        {},
        {
          get: (_target, key) => (typeof key === 'symbol' ? undefined : placeholder(key)),
          has: () => true,
        },
      ),
    );
  } catch {
    return '';
  }
}
