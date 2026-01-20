import { cookiesFromHeaders as genericCookiesFromHeaders, parseCookieString as genericParseCookieString } from '../../../Utils';
import type { GenericCookie } from '../../../Utils';
import type { Cookie } from '@azure/functions';

/**
 * Extracts cookies from a Headers object and converts them to Azure Functions Cookie format.
 *
 * This function processes the Set-Cookie headers from a standard web Response Headers object
 * and converts them into the Cookie format expected by Azure Functions. It handles the case
 * where no cookies are present by returning undefined.
 *
 * @param headers - The Headers object from a web Response
 * @returns An array of Cookie objects, or undefined if no cookies are present
 */
export function cookiesFromHeaders(headers: Headers): Cookie[] | undefined {
  const genericCookies = genericCookiesFromHeaders(headers);
  if (!genericCookies) return undefined;

  return genericCookies.map(convertGenericCookieToAzure);
}

/**
 * Parses a cookie string into an Azure Functions Cookie object.
 *
 * This function parses a standard Set-Cookie header string and extracts all cookie attributes
 * including name, value, path, sameSite, secure, httpOnly, domain, expires, and maxAge.
 * It handles URL decoding of the cookie value and proper type conversion for boolean and
 * numeric attributes.
 *
 * The function expects cookie strings in the format:
 * "name=value; path=/; secure; httpOnly; sameSite=Strict; domain=example.com; expires=Wed, 09 Jun 2021 10:18:14 GMT; max-age=3600"
 *
 * @param cookieString - The Set-Cookie header string to parse
 * @returns A Cookie object with all parsed attributes
 * @throws {Error} If the cookie string format is invalid or cannot be parsed
 */
export function parseCookieString(cookieString: string): Cookie {
  const genericCookie = genericParseCookieString(cookieString);
  return convertGenericCookieToAzure(genericCookie);
}

/**
 * Converts a generic cookie object to Azure Functions Cookie format.
 *
 * @param genericCookie - The generic cookie object to convert
 * @returns An Azure Functions Cookie object
 */
function convertGenericCookieToAzure(genericCookie: GenericCookie): Cookie {
  return {
    name: genericCookie.name,
    value: genericCookie.value,
    path: genericCookie.path,
    sameSite: genericCookie.sameSite,
    secure: genericCookie.secure,
    httpOnly: genericCookie.httpOnly,
    domain: genericCookie.domain,
    expires: genericCookie.expires,
    maxAge: genericCookie.maxAge,
  };
}
