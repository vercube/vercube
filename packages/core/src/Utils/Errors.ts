/**
 * Creates an error without capturing a stack trace.
 *
 * For the errors the framework raises as a matter of course - a 404 for a path
 * nobody routed, a 405 - the trace would only ever show the framework's own
 * frames, and capturing it is most of what such an error costs.
 *
 * @param {() => T} create - Creates the error
 * @returns {T} The error, with a stack that holds no frames
 */
export function withoutStack<T extends Error>(create: () => T): T {
  const limit = Error.stackTraceLimit;

  Error.stackTraceLimit = 0;

  try {
    return create();
  } finally {
    Error.stackTraceLimit = limit;
  }
}

/** The errors handed out again and again, see {@link shareError}. */
const SHARED_ERRORS = new WeakSet<Error>();

/**
 * Marks an error as one instance that answers many requests, such as the
 * prebuilt 404. Nothing changes such an error after it is created, so what is
 * derived from it, its response body, may be kept.
 *
 * @param {T} error - The error
 * @returns {T} The same error
 */
export function shareError<T extends Error>(error: T): T {
  SHARED_ERRORS.add(error);

  return error;
}

/**
 * Whether an error is one instance that answers many requests.
 *
 * @param {Error} error - The error
 * @returns {boolean} True for an error marked with {@link shareError}
 */
export function isSharedError(error: Error): boolean {
  return SHARED_ERRORS.has(error);
}
