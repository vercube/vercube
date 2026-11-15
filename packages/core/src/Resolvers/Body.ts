import { BadRequestError } from '../Errors/Http/BadRequestError';
import { UnsupportedMediaTypeError } from '../Errors/Http/UnsupportedMediaTypeError';
import { isSafeProperty, safeJsonParse } from '../Utils/Security';
import { readSharedText, readText } from '../Utils/SharedBody';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Parses a body that has already been read to text.
 */
type BodyParser = (text: string) => unknown;

/**
 * Resolves and parses the request body from a RouterEvent.
 *
 * @param {RouterTypes.RouterEvent} event - The router event containing the request to process
 * @returns {Promise<unknown>} A promise that resolves to:
 *   - The parsed JSON body for `application/json`, `*+json` or a request without a content type
 *   - An object of fields for `application/x-www-form-urlencoded`
 *   - The raw text for `text/*`
 *   - undefined if the request body is empty
 * @throws {BadRequestError} If the request body contains invalid JSON
 * @throws {UnsupportedMediaTypeError} If the content type has no parser
 * @throws {PayloadTooLargeError} If the body is larger than `event.bodyLimit`
 *
 * @example
 * const body = await resolveRequestBody(event);
 * if (body) {
 *   // Process the parsed body
 * }
 */
export function resolveRequestBody(event: RouterTypes.RouterEvent): Promise<unknown> {
  // The body is read from the request itself, never from a clone: cloning
  // forces the runtime to materialize a full native Request with a teed stream,
  // one of the most expensive things we can do per request. Where something
  // else may read the body too - a middleware, a second body argument, a
  // handler holding the raw request - it is read once and shared instead.
  // A failure before the read has to reject rather than throw past the caller,
  // which is what an `async` function used to guarantee. try/catch keeps the
  // contract without the microtask.
  let parser: BodyParser | null;

  try {
    parser = selectParser(event.request.headers.get('content-type'));

    if (parser === null) {
      // A request without a body has nothing to parse, whatever it claims to be.
      if (event.request.body === null) {
        return Promise.resolve(undefined);
      }

      throw new UnsupportedMediaTypeError('Unsupported request body content type');
    }
  } catch (error) {
    return Promise.reject(error);
  }

  // Chained rather than awaited: an async function here adds a frame and a
  // microtask to every request carrying a body, for no gain over `.then`.
  const text =
    event.cloneBody === false ? readText(event.request, event.bodyLimit) : readSharedText(event.request, event.bodyLimit);

  return text.then(parser);
}

/**
 * Picks the parser for a request body by its media type.
 *
 * @param {string | null} contentType - The `Content-Type` header
 * @returns {BodyParser | null} The parser, or null when the media type is not supported
 */
function selectParser(contentType: string | null): BodyParser | null {
  // No content type at all has always been read as JSON.
  if (!contentType) {
    return parseJson;
  }

  const separator = contentType.indexOf(';');
  const mediaType = (separator === -1 ? contentType : contentType.slice(0, separator)).trim().toLowerCase();

  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    return parseJson;
  }

  if (mediaType === 'application/x-www-form-urlencoded') {
    return parseUrlEncoded;
  }

  if (mediaType.startsWith('text/')) {
    return parseText;
  }

  return null;
}

/**
 * Parses a JSON body.
 *
 * @param {string} text - The raw request body
 * @returns {unknown} The parsed JSON body, or undefined when the body is empty
 * @throws {BadRequestError} If the body contains invalid JSON
 */
function parseJson(text: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return safeJsonParse(text);
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}

/**
 * Parses an `application/x-www-form-urlencoded` body. A repeated key becomes
 * an array of its values.
 *
 * @param {string} text - The raw request body
 * @returns {Record<string, string | string[]> | undefined} The fields, or undefined when the body is empty
 */
function parseUrlEncoded(text: string): Record<string, string | string[]> | undefined {
  if (!text) {
    return undefined;
  }

  const fields: Record<string, string | string[]> = {};

  for (const [key, value] of new URLSearchParams(text)) {
    if (!isSafeProperty(key)) {
      continue;
    }

    const current = Object.hasOwn(fields, key) ? fields[key] : undefined;

    if (current === undefined) {
      fields[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      fields[key] = [current, value];
    }
  }

  return fields;
}

/**
 * Returns a text body as is.
 *
 * @param {string} text - The raw request body
 * @returns {string | undefined} The text, or undefined when the body is empty
 */
function parseText(text: string): string | undefined {
  return text || undefined;
}
