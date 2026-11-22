import { isSecretKey } from '@vercube/core';
import type { Attributes, Span } from '@opentelemetry/api';

/**
 * Headers whose values are never recorded, whatever the configuration says.
 * Any other header whose name looks like a credential (see `isSecretKey`) is
 * withheld as well.
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

/**
 * Header names reach us lowercased, so the camelCase boundaries `isSecretKey`
 * relies on are gone (`x-accessToken` arrives as `x-accesstoken`). This matches
 * credential words as plain substrings to catch those.
 */
const SECRET_SUBSTRING = /token|secret|passw(?:or)?d|credential|api-?key|access-?key|private-?key|secret-?key/;

/** Placeholder written in place of a withheld value. */
const REDACTED = '<redacted>';

/** Span event name carrying the request headers. */
export const REQUEST_HEADERS_EVENT = 'http.request.headers';

/** Span event name carrying the response headers. */
export const RESPONSE_HEADERS_EVENT = 'http.response.headers';

/** How many headers one request may ask to have withheld. */
const MAX_NAMED_REDACTIONS = 8;

/** The longest header name a request may ask to have withheld. */
const MAX_HEADER_NAME_LENGTH = 64;

/** A header name, as RFC 9110 spells a token, in lower case. */
const HEADER_NAME = /^[a-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * Adds the header names a request asks to have withheld.
 *
 * Runs before the headers event is written, so the values never reach the
 * span: every processor and exporter sees the same redacted event.
 *
 * @param headers - The request headers
 * @param sources - Names of the headers that list more names, lowercase
 * @param redacted - Names withheld by configuration, lowercase
 * @returns The names to withhold for this request; `redacted` itself when the request names none
 */
export function withNamedRedactions(
  headers: Headers,
  sources: readonly string[],
  redacted: ReadonlySet<string>,
): ReadonlySet<string> {
  let merged: Set<string> | undefined;

  for (const source of sources) {
    const value = headers.get(source);

    if (!value) {
      continue;
    }

    merged ??= new Set(redacted);

    // A request names a handful of headers at most. Anything beyond that, and
    // anything that is not a header name, is ignored rather than trusted.
    let named = 0;

    for (const name of value.split(',', MAX_NAMED_REDACTIONS + 1)) {
      const lower = name.trim().toLowerCase();

      if (named < MAX_NAMED_REDACTIONS && lower.length <= MAX_HEADER_NAME_LENGTH && HEADER_NAME.test(lower)) {
        merged.add(lower);
        named++;
      }
    }
  }

  return merged ?? redacted;
}

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

    attributes[lower] =
      ALWAYS_REDACTED.has(lower) || isSecretKey(lower) || SECRET_SUBSTRING.test(lower) || extraRedacted.has(lower)
        ? REDACTED
        : value;
  }

  span.addEvent(name, attributes);
}
