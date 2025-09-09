/**
 * Generic cookie interface for cross-platform compatibility.
 * This interface represents the common properties of cookies across different platforms.
 */
export interface GenericCookie {
  name: string;
  value: string;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
  httpOnly?: boolean;
  domain?: string;
  expires?: Date;
  maxAge?: number;
}

/**
 * Parses a cookie string into a generic cookie object.
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
 * @returns A GenericCookie object with all parsed attributes
 * @throws {Error} If the cookie string format is invalid or cannot be parsed
 */
export function parseCookieString(cookieString: string): GenericCookie {
  if (!cookieString || typeof cookieString !== 'string') {
    throw new Error('Invalid cookie string: must be a non-empty string');
  }

  const parts = cookieString.split(';');
  if (parts.length === 0) {
    throw new Error('Invalid cookie string: must contain at least name=value');
  }

  const [[name, encodedValue], ...attributesArray] = parts
    .map((part) => part.split('='))
    .map(([key, value]) => [key.trim().toLowerCase(), value ?? 'true']);

  if (!name) {
    throw new Error('Invalid cookie string: cookie name is required');
  }

  const attrs: Record<string, string> = Object.fromEntries(attributesArray);

  return {
    name,
    value: encodedValue ? decodeURIComponent(encodedValue) : '',
    path: attrs['path'],
    sameSite: attrs['samesite'] as 'Strict' | 'Lax' | 'None' | undefined,
    secure: attrs['secure'] === 'true',
    httpOnly: attrs['httponly'] === 'true',
    domain: attrs['domain'],
    expires: attrs['expires'] ? new Date(attrs['expires']) : undefined,
    maxAge: attrs['max-age'] ? Number.parseInt(attrs['max-age'], 10) : undefined,
  };
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
