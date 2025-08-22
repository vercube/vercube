import { BadRequestError } from '../Errors/Http/BadRequestError';
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
export async function resolveRequestBody(event: RouterTypes.RouterEvent): Promise<unknown> {
  const text = await event.request.text();
  if (!text) {
    return undefined;
  }

  // TODO: add support for more content types
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}
