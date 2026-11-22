import { parseSetCookie } from '@vercube/core';
import type { ParsedSetCookie } from '@vercube/core';

/**
 * Generic cookie interface for cross-platform compatibility.
 * This interface represents the common properties of cookies across different platforms.
 */
export type GenericCookie = ParsedSetCookie;

/**
 * Parses a `Set-Cookie` header string into a generic cookie object: name, value, path,
 * sameSite, secure, httpOnly, domain, expires and maxAge. The name keeps its case and
 * the value is passed through as is, without URL decoding, so the cookie reaches the
 * client exactly as the application set it.
 *
 * The parser itself lives in `@vercube/core`, next to the one for request cookies.
 *
 * @param cookieString - The Set-Cookie header string to parse
 * @returns A GenericCookie object with all parsed attributes
 * @throws {Error} If the cookie string format is invalid or cannot be parsed
 */
export function parseCookieString(cookieString: string): GenericCookie {
  return parseSetCookie(cookieString);
}

/**
 * Extracts cookies from a Headers object and converts them to generic cookie format.
 *
 * This function processes the Set-Cookie headers from a standard web Response Headers object
 * and converts them into generic cookie objects. It handles the case where no cookies are
 * present by returning undefined.
 *
 * @param headers - The Headers object from a web Response
 * @returns An array of GenericCookie objects, or undefined if no cookies are present
 */
export function cookiesFromHeaders(headers: Headers): GenericCookie[] | undefined {
  const cookies = headers.getSetCookie();
  if (cookies.length === 0) return undefined;

  return cookies.map(parseCookieString);
}
