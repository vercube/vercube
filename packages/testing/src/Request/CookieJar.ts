/**
 * Parses `Set-Cookie` header values into name and value, telling a deletion
 * (`Max-Age=0` or an `Expires` in the past) apart from a cookie being set.
 *
 * Domain and path are ignored: a jar talks to one application.
 *
 * @param header - One `Set-Cookie` value
 * @returns The cookie, or null when the value has no name
 */
export function parseSetCookie(header: string): { name: string; value: string; expired: boolean } | null {
  const [pair, ...attributes] = header.split(';');
  const equals = pair.indexOf('=');

  if (equals <= 0) {
    return null;
  }

  const name = pair.slice(0, equals).trim();
  let value = pair.slice(equals + 1).trim();

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }

  let expired = false;

  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split('=');
    const attributeValue = rest.join('=').trim();

    switch (key.trim().toLowerCase()) {
      case 'max-age': {
        expired = Number(attributeValue) <= 0;
        break;
      }
      case 'expires': {
        const time = Date.parse(attributeValue);
        expired ||= !Number.isNaN(time) && time <= Date.now();
        break;
      }
      default: {
        break;
      }
    }
  }

  return { name, value, expired };
}

/**
 * Reads every `Set-Cookie` value of a response.
 *
 * @param headers - Response headers
 * @returns The values, one per cookie
 */
export function getSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  // runtimes without getSetCookie() join the values with ", ", which also
  // appears inside Expires; split only where a new name=value starts
  const joined = headers.get('set-cookie');

  return joined ? joined.split(/,\s*(?=[^;,=\s]+=)/) : [];
}

/**
 * Cookies kept between requests by an agent, the way a browser would.
 */
export class CookieJar {
  /** Cookies by name. */
  private fCookies: Map<string, string> = new Map();

  /**
   * Stores the cookies a response sets and drops the ones it expires.
   *
   * @param response - The response
   */
  public store(response: Response): void {
    for (const header of getSetCookies(response.headers)) {
      const cookie = parseSetCookie(header);

      if (!cookie) {
        continue;
      }

      if (cookie.expired) {
        this.fCookies.delete(cookie.name);
      } else {
        this.fCookies.set(cookie.name, cookie.value);
      }
    }
  }

  /**
   * Sets a cookie by hand.
   *
   * @param name - Cookie name
   * @param value - Cookie value
   */
  public set(name: string, value: string): void {
    this.fCookies.set(name, value);
  }

  /**
   * Reads a cookie.
   *
   * @param name - Cookie name
   * @returns Its value, or undefined
   */
  public get(name: string): string | undefined {
    return this.fCookies.get(name);
  }

  /**
   * Every cookie, by name.
   *
   * @returns A copy of the cookies
   */
  public all(): Record<string, string> {
    return Object.fromEntries(this.fCookies);
  }

  /** Forgets every cookie. */
  public clear(): void {
    this.fCookies.clear();
  }

  /**
   * Renders the `Cookie` request header.
   *
   * @returns The header value, or an empty string without cookies
   */
  public header(): string {
    return [...this.fCookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}
