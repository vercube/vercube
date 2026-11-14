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
