import { BadRequestError } from '../Errors/Http/BadRequestError';
import { PayloadTooLargeError } from '../Errors/Http/PayloadTooLargeError';
import { UnsupportedMediaTypeError } from '../Errors/Http/UnsupportedMediaTypeError';
import { isSafeProperty, safeJsonParse } from '../Utils/Security';
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
  // Cloning is what makes the body readable twice, but it forces the runtime to
  // materialize a full native Request with a teed stream - one of the most
  // expensive things we can do per request. It is only needed when the handler
  // also receives the raw request and may read the body itself.
  // `clone()` throws when the body has already been consumed, and that has to
  // reject rather than throw past the caller, which is what an `async` function
  // used to guarantee. try/catch keeps the contract without the microtask.
  let request: Request;
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

    request = event.cloneBody === false ? event.request : event.request.clone();
  } catch (error) {
    return Promise.reject(error);
  }

  // Chained rather than awaited: an async function here adds a frame and a
  // microtask to every request carrying a body, for no gain over `.then`.
  return readBody(request, event.bodyLimit).then(parser);
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
 * Reads a request body to text, enforcing the size limit.
 *
 * A declared `Content-Length` is checked up front, so an oversized body is
 * rejected before a single byte is read. Without one (a chunked body) the
 * stream is read chunk by chunk and abandoned as soon as it crosses the limit.
 *
 * @param {Request} request - The request to read
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<string>} The body text
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
function readBody(request: Request, limit: number | undefined): Promise<string> {
  if (limit === undefined) {
    return request.text();
  }

  const length = request.headers.get('content-length');

  if (length !== null) {
    if (Number(length) > limit) {
      return Promise.reject(new PayloadTooLargeError('Request body is too large'));
    }

    return request.text();
  }

  return readLimited(request, limit);
}

/**
 * Reads a body without a declared length, stopping once it exceeds the limit.
 *
 * @param {Request} request - The request to read
 * @param {number} limit - The maximum body size in bytes
 * @returns {Promise<string>} The body text
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
async function readLimited(request: Request, limit: number): Promise<string> {
  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > limit) {
      await reader.cancel();
      throw new PayloadTooLargeError('Request body is too large');
    }

    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
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
