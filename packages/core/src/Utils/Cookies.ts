/**
 * Options of a cookie written with {@link setCookie}.
 */
export interface CookieOptions {
  /** Path the cookie is sent for. Defaults to `/`, so the cookie is visible to the whole site. */
  path?: string;
  /** Host the cookie is sent to. Without it the cookie belongs to the exact host that set it. */
  domain?: string;
  /** Lifetime in seconds. `0` removes the cookie. */
  maxAge?: number;
  /** Moment the cookie expires. */
  expires?: Date;
  /** Keeps the cookie away from `document.cookie`. */
  httpOnly?: boolean;
  /** Sends the cookie over HTTPS only. Required by `sameSite: 'none'` and by `partitioned`. */
  secure?: boolean;
  /** Cross-site policy of the cookie. */
  sameSite?: 'strict' | 'lax' | 'none';
  /** Stores the cookie per top-level site (CHIPS). */
  partitioned?: boolean;
  /** Eviction priority, read by Chromium. */
  priority?: 'low' | 'medium' | 'high';
}

/**
 * What a `Set-Cookie` header value says, read by {@link parseSetCookie}.
 */
export interface ParsedSetCookie {
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

/** A cookie name is an HTTP token (RFC 6265 4.1.1, RFC 7230 3.2.6). */
const COOKIE_NAME = /^[\w!#$%&'*+.^`|~-]+$/;

/** Attribute values end at `;` and may not hold control characters. */
// eslint-disable-next-line no-control-regex
const ATTRIBUTE_VALUE = /^[^;\u0000-\u001F\u007F]*$/;

const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' } as const;
const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High' } as const;

/**
 * Decodes a cookie value. A value that is not valid percent-encoding is
 * returned as it was sent rather than failing the request.
 *
 * @param value - The raw value
 * @returns The decoded value
 */
function decodeValue(value: string): string {
  if (!value.includes('%')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Cuts one `name=value` pair out of a `Cookie` header and strips the optional
 * double quotes around the value.
 *
 * @param header - The header
 * @param start - Index of the first character of the value
 * @param end - Index after the last character of the value
 * @returns The decoded value
 */
function readValue(header: string, start: number, end: number): string {
  while (start < end && (header.codePointAt(start) === 32 || header.codePointAt(start) === 9)) {
    start++;
  }

  while (end > start && (header.codePointAt(end - 1) === 32 || header.codePointAt(end - 1) === 9)) {
    end--;
  }

  if (end - start >= 2 && header.codePointAt(start) === 34 && header.codePointAt(end - 1) === 34) {
    start++;
    end--;
  }

  return decodeValue(header.slice(start, end));
}

/**
 * Parses a `Cookie` request header into an object of names and decoded values.
 * When a name is sent more than once the first one wins, which is the most
 * specific one in the order browsers send them.
 *
 * @param header - The value of the `Cookie` header
 * @returns The cookies by name, without a prototype
 */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null);

  if (!header) {
    return cookies;
  }

  let index = 0;

  while (index < header.length) {
    let end = header.indexOf(';', index);

    if (end === -1) {
      end = header.length;
    }

    const separator = header.indexOf('=', index);

    // a pair without `=` carries no name to read it by
    if (separator !== -1 && separator < end) {
      const name = header.slice(index, separator).trim();

      if (name && cookies[name] === undefined) {
        cookies[name] = readValue(header, separator + 1, end);
      }
    }

    index = end + 1;
  }

  return cookies;
}

/**
 * Reads one cookie out of a `Cookie` request header without building an object
 * of all of them.
 *
 * @param header - The value of the `Cookie` header
 * @param name - The cookie to read
 * @returns The decoded value, or undefined when the cookie was not sent
 */
export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header || !name) {
    return undefined;
  }

  let index = 0;

  while (index < header.length) {
    let end = header.indexOf(';', index);

    if (end === -1) {
      end = header.length;
    }

    const separator = header.indexOf('=', index);

    if (separator !== -1 && separator < end && header.slice(index, separator).trim() === name) {
      return readValue(header, separator + 1, end);
    }

    index = end + 1;
  }

  return undefined;
}

/**
 * Builds a `Set-Cookie` header value.
 *
 * The value is percent-encoded, so it may hold any string. The name, `path`
 * and `domain` are written as given and rejected when they would break out of
 * the header.
 *
 * @param name - The cookie name
 * @param value - The cookie value
 * @param options - Attributes of the cookie
 * @returns The header value
 * @throws {TypeError} When the name or an attribute cannot be written safely
 */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  if (!COOKIE_NAME.test(name)) {
    throw new TypeError(`Invalid cookie name: ${JSON.stringify(name)}`);
  }

  const path = options.path ?? '/';

  if (!ATTRIBUTE_VALUE.test(path)) {
    throw new TypeError(`Invalid cookie path: ${JSON.stringify(path)}`);
  }

  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}`;

  if (options.domain !== undefined) {
    if (!ATTRIBUTE_VALUE.test(options.domain)) {
      throw new TypeError(`Invalid cookie domain: ${JSON.stringify(options.domain)}`);
    }

    cookie += `; Domain=${options.domain}`;
  }

  if (options.maxAge !== undefined) {
    if (!Number.isFinite(options.maxAge)) {
      throw new TypeError(`Invalid cookie maxAge: ${options.maxAge}`);
    }

    cookie += `; Max-Age=${Math.trunc(options.maxAge)}`;
  }

  if (options.expires !== undefined) {
    if (Number.isNaN(options.expires.getTime())) {
      throw new TypeError('Invalid cookie expires: not a valid date');
    }

    cookie += `; Expires=${options.expires.toUTCString()}`;
  }

  if (options.httpOnly) {
    cookie += '; HttpOnly';
  }

  // browsers drop a `SameSite=None` or `Partitioned` cookie that is not `Secure`
  if (options.secure || options.sameSite === 'none' || options.partitioned) {
    cookie += '; Secure';
  }

  if (options.sameSite !== undefined) {
    const sameSite = SAME_SITE[options.sameSite];

    if (!sameSite) {
      throw new TypeError(`Invalid cookie sameSite: ${JSON.stringify(options.sameSite)}`);
    }

    cookie += `; SameSite=${sameSite}`;
  }

  if (options.partitioned) {
    cookie += '; Partitioned';
  }

  if (options.priority !== undefined) {
    const priority = PRIORITY[options.priority];

    if (!priority) {
      throw new TypeError(`Invalid cookie priority: ${JSON.stringify(options.priority)}`);
    }

    cookie += `; Priority=${priority}`;
  }

  return cookie;
}

/**
 * Extracts the name from a `Set-Cookie` header value.
 *
 * @param cookie - The header value, e.g. `session=abc; HttpOnly`
 * @returns The cookie name, e.g. `session`
 */
export function getSetCookieName(cookie: string): string {
  const index = cookie.indexOf('=');

  return (index === -1 ? cookie : cookie.slice(0, index)).trim();
}

/**
 * Adds a cookie to a response. Other cookies stay as they are; a cookie the
 * response already sets under the same name is replaced, so calling this twice
 * does not send the name twice.
 *
 * Pass the `@Response()` argument of a handler, the response a middleware
 * receives, or any `Response` or `Headers` you are about to return.
 *
 * @param target - The response, or its headers
 * @param name - The cookie name
 * @param value - The cookie value
 * @param options - Attributes of the cookie
 */
export function setCookie(target: Response | Headers, name: string, value: string, options?: CookieOptions): void {
  const headers = target instanceof Headers ? target : target.headers;
  const cookie = serializeCookie(name, value, options);
  const kept = headers.getSetCookie().filter((existing) => getSetCookieName(existing) !== name);

  if (kept.length !== headers.getSetCookie().length) {
    headers.delete('set-cookie');

    for (const existing of kept) {
      headers.append('set-cookie', existing);
    }
  }

  headers.append('set-cookie', cookie);
}

/**
 * Tells the browser to remove a cookie. `path` and `domain` have to match the
 * ones the cookie was set with, or the browser keeps it.
 *
 * @param target - The response, or its headers
 * @param name - The cookie name
 * @param options - `path`, `domain` and the flags the cookie was set with
 */
export function deleteCookie(
  target: Response | Headers,
  name: string,
  options?: Omit<CookieOptions, 'maxAge' | 'expires'>,
): void {
  setCookie(target, name, '', { ...options, maxAge: 0, expires: new Date(0) });
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
 * Parses a `Set-Cookie` header value into the cookie and its attributes. The
 * name keeps its case and the value is passed through as is, without URL
 * decoding, so it can be handed on exactly as the application set it.
 *
 * @param header - One `Set-Cookie` header value
 * @returns The cookie and its attributes
 * @throws {Error} When the value has no `name=value` pair
 */
export function parseSetCookie(header: string): ParsedSetCookie {
  if (!header || typeof header !== 'string') {
    throw new Error('Invalid cookie string: must be a non-empty string');
  }

  const [nameValue, ...attributeParts] = header.split(';');
  // split on the first `=` only: values such as base64 padding contain more of them
  const [nameRaw, value] = splitOnce(nameValue);
  const name = nameRaw.trim();

  if (!name || value === undefined) {
    throw new Error('Invalid cookie string: must contain a name and value separated by "="');
  }

  const attrs: Record<string, string> = {};

  for (const part of attributeParts) {
    const [key, attributeValue] = splitOnce(part);
    attrs[key.trim().toLowerCase()] = attributeValue?.trim() ?? 'true';
  }

  const sameSite = attrs['samesite']?.toLowerCase();

  return {
    name,
    value: value.trim(),
    path: attrs['path'],
    sameSite: sameSite && sameSite in SAME_SITE ? SAME_SITE[sameSite as keyof typeof SAME_SITE] : undefined,
    secure: attrs['secure'] === 'true',
    httpOnly: attrs['httponly'] === 'true',
    domain: attrs['domain'],
    expires: attrs['expires'] ? new Date(attrs['expires']) : undefined,
    maxAge: attrs['max-age'] ? Number.parseInt(attrs['max-age'], 10) : undefined,
  };
}
