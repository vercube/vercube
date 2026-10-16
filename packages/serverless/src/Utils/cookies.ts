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
 * The name keeps its case and the value is passed through as is, without URL decoding,
 * so the cookie reaches the client exactly as the application set it.
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

  // Safely extract the name-value pair
  const [nameValue, ...attributeParts] = parts;
  // Split on the first `=` only: values such as base64 padding contain more of them
  const [nameRaw, value] = splitOnce(nameValue);
  const name = nameRaw.trim();
  if (!name || value === undefined) {
    throw new Error('Invalid cookie string: must contain a name and value separated by "="');
  }

  // Process attributes
  const attrs: Record<string, string> = {};
  for (const part of attributeParts) {
    const [key, attributeValue] = splitOnce(part);
    attrs[key.trim().toLowerCase()] = attributeValue?.trim() ?? 'true';
  }

  return {
    name,
    value: value.trim(),
    path: attrs['path'],
    sameSite: normalizeSameSite(attrs['samesite']),
    secure: attrs['secure'] === 'true',
    httpOnly: attrs['httponly'] === 'true',
    domain: attrs['domain'],
    expires: attrs['expires'] ? new Date(attrs['expires']) : undefined,
    maxAge: attrs['max-age'] ? Number.parseInt(attrs['max-age'], 10) : undefined,
  };
}

/**
 * Splits a string on its first `=`.
 *
 * @param part - The string to split
 * @returns The text before the first `=` and the rest, or undefined when there is no `=`
 */
function splitOnce(part: string): [string, string | undefined] {
  const index = part.indexOf('=');
  return index === -1 ? [part, undefined] : [part.slice(0, index), part.slice(index + 1)];
}

/**
 * Normalizes a `SameSite` attribute to the casing the platforms expect.
 *
 * @param value - The raw attribute value
 * @returns `Strict`, `Lax` or `None`, or undefined for anything else
 */
function normalizeSameSite(value: string | undefined): GenericCookie['sameSite'] {
  switch (value?.toLowerCase()) {
    case 'strict': {
      return 'Strict';
    }
    case 'lax': {
      return 'Lax';
    }
    case 'none': {
      return 'None';
    }
    default: {
      return undefined;
    }
  }
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
