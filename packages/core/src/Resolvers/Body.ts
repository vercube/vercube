import { BadRequestError } from '../Errors/Http/BadRequestError';
import { safeJsonParse } from '../Utils/Security';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Resolves and parses the request body from a RouterEvent.
 *
 * @param {RouterTypes.RouterEvent} event - The router event containing the request to process
 * @returns {Promise<unknown>} A promise that resolves to:
 *   - The parsed JSON body if the request contains valid JSON
 *   - undefined if the request body is empty
 * @throws {BadRequestError} If the request body contains invalid JSON
 *
 * @example
 * const body = await resolveRequestBody(event);
 * if (body) {
 *   // Process the parsed body
 * }
 *
 * @remarks
 * - Currently only supports JSON content type
 * - Returns undefined for empty request bodies
 * - Throws BadRequestError for malformed JSON
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

  try {
    request = event.cloneBody === false ? event.request : event.request.clone();
  } catch (error) {
    return Promise.reject(error);
  }

  // Chained rather than awaited: an async function here adds a frame and a
  // microtask to every request carrying a body, for no gain over `.then`.
  // `parseBody` is a named function so the chain allocates no closure, and a
  // throw inside it rejects exactly as `await` would have.
  return request.text().then(parseBody);
}

/**
 * Parses a request body that has already been read to text.
 *
 * @param {string} text - The raw request body
 * @returns {unknown} The parsed JSON body, or undefined when the body is empty
 * @throws {BadRequestError} If the body contains invalid JSON
 */
function parseBody(text: string): unknown {
  if (!text) {
    return undefined;
  }

  // TODO: add support for more content types
  try {
    return safeJsonParse(text);
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}
