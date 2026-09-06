import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { ERROR_TYPE, HTTP_RESPONSE_STATUS_CODE } from './Attributes';
import type { Context, Exception, Span, SpanOptions, Tracer } from '@opentelemetry/api';

/** Lowest HTTP status code that marks a *server* span as failed. */
const SERVER_ERROR_STATUS = 500;

/**
 * Starts a span, runs `fn` inside it and ends it once the work settles.
 *
 * The result of `fn` is returned unchanged. That matters more than it looks:
 * a Vercube route without middlewares produces its `Response` synchronously,
 * and wrapping it in a promise would add a microtask to every request.
 *
 * @param tracer - Tracer to start the span on
 * @param name - Span name
 * @param options - Span options (kind, attributes, links)
 * @param parent - Context the span is a child of
 * @param fn - The work to trace
 * @param onSettle - Called with the outcome just before the span ends. Returning a
 *   promise keeps the span open until it settles, without extending its duration.
 * @returns Whatever `fn` returned
 */
export function runInSpan<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions,
  parent: Context,
  fn: (span: Span) => T,
  onSettle?: (span: Span, value: unknown, error: unknown) => void | Promise<void>,
): T {
  const span = tracer.startSpan(name, options, parent);

  const settle = (value: unknown, error: unknown): void => {
    if (error === undefined) {
      completeSpan(span, value);
    } else {
      failSpan(span, error);
    }

    const pending = onSettle?.(span, value, error);

    // A settle callback that needs to read something asynchronously - body
    // capture does - keeps the span open, but the end time is taken now so the
    // recorded duration still measures the request rather than the capture.
    if (pending !== undefined) {
      const endTime = Date.now();

      void pending.then(
        () => span.end(endTime),
        () => span.end(endTime),
      );

      return;
    }

    span.end();
  };

  return context.with(trace.setSpan(parent, span), () => {
    let result: T;

    try {
      result = fn(span);
    } catch (error) {
      settle(undefined, error ?? new Error('Unknown error'));
      throw error;
    }

    if (isPromiseLike(result)) {
      return (result as PromiseLike<unknown>).then(
        (value: unknown) => {
          settle(value, undefined);
          return value;
        },
        (error: unknown) => {
          settle(undefined, error ?? new Error('Unknown error'));
          throw error;
        },
      ) as T;
    }

    settle(result, undefined);

    return result;
  });
}

/**
 * Applies the outcome of a successful call to a span.
 *
 * When the value is a `Response` the HTTP status is recorded, and a 5xx marks
 * the span as failed - a 4xx does not, because on a server span it describes
 * the caller's request rather than a fault of the handler.
 *
 * @param span - The span to update
 * @param value - The value the traced work produced
 */
export function completeSpan(span: Span, value: unknown): void {
  if (!(value instanceof Response)) {
    return;
  }

  span.setAttribute(HTTP_RESPONSE_STATUS_CODE, value.status);

  if (value.status >= SERVER_ERROR_STATUS) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

/**
 * Records a thrown value on a span and marks the span as failed.
 *
 * @param span - The span to update
 * @param error - The thrown value
 */
export function failSpan(span: Span, error: unknown): void {
  span.recordException(error as Exception);
  span.setAttribute(ERROR_TYPE, errorType(error));

  // A 404 or a 401 describes the request, not a fault of the server, and the
  // HTTP semantic conventions say a server span must only be ERROR for 5xx.
  // Marking them failed turns every probe for a missing page into an incident.
  if (httpStatusOf(error) < SERVER_ERROR_STATUS) {
    return;
  }

  span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
}

/**
 * Reads the HTTP status a thrown value carries, if any.
 *
 * Duck-typed rather than imported: the framework's `HttpError` lives in core,
 * and an application is free to throw its own error type with a `status`.
 *
 * @param error - The thrown value
 * @returns The status, or 500 when the value carries none
 */
function httpStatusOf(error: unknown): number {
  const status = (error as { status?: unknown; statusCode?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode;

  return typeof status === 'number' ? status : SERVER_ERROR_STATUS;
}

/**
 * Names the type of a thrown value for the `error.type` attribute.
 *
 * @param error - The thrown value
 * @returns The error type name
 */
export function errorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error;
  }

  // `name` wins over the constructor: it is what the error deliberately calls
  // itself, and a bundler is free to rename the class behind it.
  if (error.name && error.name !== 'Error') {
    return error.name;
  }

  return error.constructor?.name || 'Error';
}

/**
 * Extracts a message from a thrown value.
 *
 * @param error - The thrown value
 * @returns The message, or an empty string
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/**
 * Whether a value can be awaited.
 *
 * @param value - The value to test
 * @returns True for thenables
 */
function isPromiseLike(value: unknown): boolean {
  return value instanceof Promise || typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}
