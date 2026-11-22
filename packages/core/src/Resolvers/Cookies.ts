import { parseCookie, parseCookies } from '../Utils/Cookies';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Retrieves one cookie from the request.
 *
 * @param {string} name - The name of the cookie to retrieve
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {string | undefined} The decoded value if the cookie was sent, undefined otherwise, so a parameter default applies
 */
export function getRequestCookie(name: string, event: RouterTypes.RouterEvent): string | undefined {
  return parseCookie(event.request.headers.get('cookie'), name);
}

/**
 * Retrieves every cookie of the request.
 *
 * @param {RouterTypes.RouterEvent} event - The router event containing the request
 * @returns {Record<string, string>} The decoded cookies by name, empty when none was sent
 */
export function getRequestCookies(event: RouterTypes.RouterEvent): Record<string, string> {
  return parseCookies(event.request.headers.get('cookie'));
}
