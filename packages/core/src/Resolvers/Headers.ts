import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Retrieves a specific header value from the request
 * @param {string} header - The name of the header to retrieve
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {string | undefined} The header value if found, undefined otherwise, so a parameter default applies
 */
export function getRequestHeader(header: string, event: RouterTypes.RouterEvent): string | undefined {
  return event.request.headers.get(header) ?? undefined;
}

/**
 * Retrieves all headers from the request
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {Record<string, string>} The headers as a plain object with lowercase names
 */
export function getRequestHeaders(event: RouterTypes.RouterEvent): Record<string, string> {
  return Object.fromEntries(event.request.headers);
}
