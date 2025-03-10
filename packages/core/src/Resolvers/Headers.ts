import { RouterTypes } from '../Types/RouterTypes';

/**
 * Retrieves a specific header value from the request
 * @param {string} header - The name of the header to retrieve
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {string | null} The header value if found, null otherwise
 */
export function getRequestHeader(header: string, event: RouterTypes.RouterEvent): string | null {
  return event.request.headers.get(header);
}

/**
 * Retrieves all headers from the request
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {Headers} The complete Headers object from the request
 */
export function getRequestHeaders(event: RouterTypes.RouterEvent): Headers {
  return event.request.headers;
}