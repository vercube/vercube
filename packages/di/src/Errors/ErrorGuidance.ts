/**
 * What a framework error says beyond its message: a stable code to look it
 * up by, why it happened and what to do about it.
 *
 * The fields are the ones evlog reads off an error, so a logged error carries
 * them in its wide event without this package depending on the logger.
 */
export interface ErrorGuidance {
  /** Stable, machine-readable identifier, for example `VERCUBE_DI_UNRESOLVED`. Public API once released. */
  code?: string;
  /** Why the error happened, in one or two sentences. Never holds values taken from a request. */
  why?: string;
  /** What to do about it: the exact decorator, option or command. */
  fix?: string;
  /** The documentation page for the error. */
  link?: string;
  /**
   * Whether `why`, `fix` and `link` may be sent to a client outside
   * development. Off by default: guidance describes the application's
   * internals.
   */
  expose?: boolean;
  /** Context for whoever reads the log. Never sent to a client. */
  internal?: Record<string, unknown>;
}

/**
 * Marks an error whose guidance was attached by this package. Registered
 * globally, so a second copy of the package recognises it too.
 *
 * Reading goes by shape, but `expose` is only believed on a marked error:
 * other libraries set an `expose` flag of their own (`http-errors` does, to
 * say the message is safe), and that is not a statement about guidance.
 */
export const GUIDANCE_BRAND: unique symbol = Symbol.for('vercube.error.guidance') as never;

/** The descriptor that marks an error, see {@link GUIDANCE_BRAND}. */
export const GUIDANCE_BRAND_DESCRIPTOR: PropertyDescriptor = Object.freeze({
  value: true,
  enumerable: false,
  writable: false,
  configurable: true,
});

/** The guidance fields, in the order they are attached. */
const FIELDS = ['code', 'why', 'fix', 'link', 'expose', 'internal'] as const;

/**
 * Attaches guidance to an error and returns the same error.
 *
 * The fields are not enumerable. An error handler that answers with
 * `{ ...error }` or `JSON.stringify(error)` therefore sends what it sent
 * before, while a logger that reads `error.why` finds it.
 *
 * @example
 * ```ts
 * throw describeError(new ForbiddenError('Plan limit reached'), {
 *   code: 'BILLING_PLAN_LIMIT',
 *   why: 'The workspace is on the free plan, which allows three projects.',
 *   fix: 'Upgrade the workspace, or delete a project.',
 * });
 * ```
 *
 * @param {T} error - The error to describe
 * @param {ErrorGuidance} guidance - The fields to attach
 * @returns {T} The same error
 */
export function describeError<T extends Error>(error: T, guidance: ErrorGuidance): T {
  // an error that cannot take new fields is still the error to throw
  if (!Object.isExtensible(error)) {
    return error;
  }

  for (const field of FIELDS) {
    const value = guidance[field];

    if (value !== undefined) {
      Object.defineProperty(error, field, { value, enumerable: false, writable: true, configurable: true });
    }
  }

  Object.defineProperty(error, GUIDANCE_BRAND, GUIDANCE_BRAND_DESCRIPTOR);

  return error;
}

/**
 * Reads the guidance an error carries. It goes by the shape of the error and
 * not by its class, so an error from another copy of this package, or from
 * evlog's `createError()`, is read the same way. Only `expose` needs an error
 * described by `describeError()` or a catalog, as it decides what a client is
 * shown.
 *
 * @param {unknown} error - Anything that was thrown
 * @returns {ErrorGuidance | undefined} The guidance, or undefined when the error carries none
 */
export function getErrorGuidance(error: unknown): ErrorGuidance | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const source = error as Record<string, unknown>;
  const guidance: ErrorGuidance = {};
  let found = false;

  for (const field of ['code', 'why', 'fix', 'link'] as const) {
    const value = source[field];

    if (typeof value === 'string' && value.length > 0) {
      guidance[field] = value;
      found = true;
    }
  }

  if (!found) {
    return undefined;
  }

  if (source.expose === true && (source as { [GUIDANCE_BRAND]?: boolean })[GUIDANCE_BRAND] === true) {
    guidance.expose = true;
  }

  if (typeof source.internal === 'object' && source.internal !== null) {
    guidance.internal = source.internal as Record<string, unknown>;
  }

  return guidance;
}
