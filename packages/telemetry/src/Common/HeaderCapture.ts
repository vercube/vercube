import type { Attributes, Span } from '@opentelemetry/api';

/**
 * Headers whose values are never recorded, whatever the configuration says.
 *
 * A recorded `Authorization` header is a leaked credential the moment the trace
 * leaves the process, and an inspector screenshot is enough. The names are
 * still recorded so it stays visible that the header was present.
 */
const ALWAYS_REDACTED: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
]);

/** Placeholder written in place of a withheld value. */
const REDACTED = '<redacted>';

/** Span event name carrying the request headers. */
export const REQUEST_HEADERS_EVENT = 'http.request.headers';

/** Span event name carrying the response headers. */
export const RESPONSE_HEADERS_EVENT = 'http.response.headers';

/**
 * Records a message's headers as a span event.
 *
 * Recorded as one event with one attribute per header rather than as span
 * attributes, so they stay grouped and cannot collide with the semantic
 * conventions.
 *
 * @param span - The span to annotate
 * @param name - Event name
 * @param headers - The headers to record
 * @param extraRedacted - Additional header names to withhold, lowercase
 */
export function addHeadersEvent(span: Span, name: string, headers: Headers, extraRedacted: ReadonlySet<string>): void {
  const attributes: Attributes = {};

  for (const [key, value] of headers) {
    const lower = key.toLowerCase();

    attributes[lower] = ALWAYS_REDACTED.has(lower) || extraRedacted.has(lower) ? REDACTED : value;
  }

  span.addEvent(name, attributes);
}
